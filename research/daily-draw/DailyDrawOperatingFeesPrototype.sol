// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "protocol/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "protocol/contracts/interfaces/ID20VRF.sol";

interface IFeeSettlement {
    function requestFeePaid(uint256 id) external view returns (uint256);
    function requestRefundBps(uint256 id) external view returns (uint16);
    function refundCredits(address recipient) external view returns (uint256);
    function withdrawRefundCredit(address payable recipient) external;
}

/// @notice One refund address per accepted request; never an account for ticket funds.
/// @dev LOCAL ONLY. Unsolicited/forced value is not withdrawable as operating credit.
contract DailyDrawFeeRefundAccount {
    address public immutable budget;
    address public immutable coordinator;
    uint256 public received;
    error Unauthorized();
    error InsufficientRefund();
    error TransferFailed();

    constructor(address service) {
        require(block.chainid == 31337 || block.chainid == 31338, "LOCAL_ONLY");
        budget = msg.sender;
        coordinator = service;
    }

    receive() external payable {
        if (msg.sender != coordinator) revert Unauthorized();
        received += msg.value;
    }

    function recoverCredit() external {
        if (msg.sender != budget) revert Unauthorized();
        if (IFeeSettlement(coordinator).refundCredits(address(this)) != 0)
            IFeeSettlement(coordinator).withdrawRefundCredit(payable(address(this)));
    }

    function release(uint256 amount) external {
        if (msg.sender != budget) revert Unauthorized();
        if (amount > received) revert InsufficientRefund();
        received -= amount;
        (bool ok,) = payable(budget).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

/// @notice Research fee consumer, deliberately separate from DailyDrawPrototype.
/// @dev NOT connected to public tickets, MSS2, swaps, payouts or arcade reserves.
/// Future draw-controller wiring requires separate integration review. A supplied
/// locked-input digest is a commitment, not proof of paid tickets or funded prizes.
contract DailyDrawOperatingFeesPrototype is D20VRFConsumer {
    enum Phase { Missing, Authorized, Requested, Ready, Unfulfilled }
    struct Budget {
        address payer;
        uint256 maximumFee;
        bytes32 lockedInputs;
        Phase phase;
        uint256 requestId;
        uint256 provided;
        uint256 charged;
        uint256 refundable;
        address refundAccount;
        uint256 credit;
        uint256 refunded;
        uint256 withdrawn;
        bytes32 word;
        bool refundCollected;
    }

    uint32 public constant CALLBACK_GAS = 120_000;
    bytes32 public constant DOMAIN = keccak256("YIELD_VACUUM_OPERATING_FEES_RESEARCH_V1");
    address public immutable controller;
    mapping(uint256 => Budget) public budgets;
    mapping(uint256 => uint256) public requestRound;
    uint256 public totalCredits;
    uint256 private entered = 1;
    address private receivingFrom;
    uint256 private receivedDuringCollection;

    error LocalOnly();
    error Unauthorized();
    error InvalidInput();
    error WrongPhase();
    error FeeAboveMaximum();
    error InsufficientBudget();
    error SettlementMismatch();
    error Reentered();
    error TransferFailed();

    event BudgetAuthorized(uint256 indexed roundId, address indexed payer, uint256 maximumFee, bytes32 lockedInputs);
    event RequestFunded(uint256 indexed roundId, uint256 indexed requestId, address indexed payer,
        uint256 provided, uint256 charged, address refundAccount, bytes32 requestSeed);
    event ResultStored(uint256 indexed roundId, uint256 indexed requestId, bytes32 word);
    event ServiceUnfulfilled(uint256 indexed roundId, uint256 indexed requestId);
    event RefundCollected(uint256 indexed roundId, uint256 indexed requestId, uint256 amount);
    event CreditWithdrawn(uint256 indexed roundId, address indexed payer, address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        if (entered != 1) revert Reentered();
        entered = 2;
        _;
        entered = 1;
    }

    constructor(address service, address roundController) D20VRFConsumer(service) {
        if (block.chainid != 31337 && block.chainid != 31338) revert LocalOnly();
        if (service.code.length == 0 || roundController == address(0)) revert InvalidInput();
        controller = roundController;
    }

    /// @dev No general deposit or arbitrary receive path. Ingress is an explicit
    /// collection from the current round's refund account, not a balance sweep.
    receive() external payable {
        if (msg.sender != receivingFrom || receivingFrom == address(0)) revert Unauthorized();
        receivedDuringCollection += msg.value;
    }

    function authorizeBudget(uint256 roundId, address payer, uint256 maximumFee, bytes32 lockedInputs)
        external nonReentrant
    {
        if (msg.sender != controller) revert Unauthorized();
        if (roundId == 0 || payer == address(0) || payer == address(this) || maximumFee == 0 || lockedInputs == bytes32(0))
            revert InvalidInput();
        if (budgets[roundId].phase != Phase.Missing) revert WrongPhase();
        Budget storage b = budgets[roundId];
        b.payer = payer;
        b.maximumFee = maximumFee;
        b.lockedInputs = lockedInputs;
        b.phase = Phase.Authorized;
        emit BudgetAuthorized(roundId, payer, maximumFee, lockedInputs);
    }

    /// @notice Caller supplies its own native operating funds, not ticket funds.
    /// Only this call's msg.value can pay the service. Existing credits cannot.
    function requestWithBudget(uint256 roundId) external payable nonReentrant returns (uint256 id) {
        Budget storage b = budgets[roundId];
        if (b.phase != Phase.Authorized) revert WrongPhase();
        if (msg.sender != b.payer) revert Unauthorized();
        uint256 fee = ID20VRF(vrfCoordinator).quoteFee(CALLBACK_GAS);
        if (fee > b.maximumFee) revert FeeAboveMaximum();
        if (msg.value < fee) revert InsufficientBudget();
        // Caps both authorized service spend and accidentally submitted funding.
        if (msg.value > b.maximumFee) revert FeeAboveMaximum();
        DailyDrawFeeRefundAccount account = new DailyDrawFeeRefundAccount(vrfCoordinator);
        bytes32 seed = keccak256(abi.encode(DOMAIN, block.chainid, address(this), controller,
            roundId, b.lockedInputs, b.payer, b.maximumFee, vrfCoordinator));
        b.phase = Phase.Requested;
        b.provided = msg.value;
        b.charged = fee;
        b.credit = msg.value - fee;
        b.refundAccount = address(account);
        totalCredits += b.credit;
        id = ID20VRF(vrfCoordinator).requestRandomness{value: fee}(seed, CALLBACK_GAS, address(account));
        if (id == 0 || requestRound[id] != 0 || IFeeSettlement(vrfCoordinator).requestFeePaid(id) != fee)
            revert SettlementMismatch();
        uint16 ratio = IFeeSettlement(vrfCoordinator).requestRefundBps(id);
        if (ratio > 10_000) revert SettlementMismatch();
        b.refundable = fee / 10_000 * ratio + fee % 10_000 * ratio / 10_000;
        b.requestId = id;
        requestRound[id] = roundId;
        emit RequestFunded(roundId, id, b.payer, msg.value, fee, address(account), seed);
    }

    /// @notice Same result is retained permanently; no new request after acceptance or expiry.
    function _fulfillRandomness(uint256 id, bytes32 word) internal override {
        uint256 roundId = requestRound[id];
        Budget storage b = budgets[roundId];
        if (roundId == 0 || b.requestId != id || b.phase != Phase.Requested) revert WrongPhase();
        b.word = word;
        b.phase = Phase.Ready;
        emit ResultStored(roundId, id, word);
    }

    function _onRefund(uint256 id) internal override {
        uint256 roundId = requestRound[id];
        Budget storage b = budgets[roundId];
        if (roundId == 0 || b.requestId != id || b.phase != Phase.Requested) revert WrongPhase();
        b.phase = Phase.Unfulfilled;
        // An authenticated notification is not proof that native value arrived.
        emit ServiceUnfulfilled(roundId, id);
    }

    /// @notice Anyone may reconcile; the locked payer, not caller, owns the credit.
    /// This recovers a randomness SERVICE fee only, never a participant refund.
    function collectRefund(uint256 roundId) external nonReentrant {
        Budget storage b = budgets[roundId];
        if (b.phase != Phase.Unfulfilled || b.refundCollected) revert WrongPhase();
        b.refundCollected = true;
        receivingFrom = b.refundAccount;
        receivedDuringCollection = 0;
        DailyDrawFeeRefundAccount account = DailyDrawFeeRefundAccount(payable(b.refundAccount));
        account.recoverCredit();
        account.release(b.refundable);
        receivingFrom = address(0);
        if (receivedDuringCollection != b.refundable) revert SettlementMismatch();
        receivedDuringCollection = 0;
        b.refunded = b.refundable;
        b.credit += b.refundable;
        totalCredits += b.refundable;
        emit RefundCollected(roundId, b.requestId, b.refundable);
    }

    /// @notice A payer can withdraw only its round credit, to an address it selects.
    /// A failed recipient restores credit atomically; it cannot block other rounds.
    function withdrawCredit(uint256 roundId, uint256 amount, address payable recipient) external nonReentrant {
        Budget storage b = budgets[roundId];
        if (msg.sender != b.payer) revert Unauthorized();
        if (amount == 0 || amount > b.credit || recipient == address(0) || recipient == address(this)) revert InvalidInput();
        b.credit -= amount;
        b.withdrawn += amount;
        totalCredits -= amount;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit CreditWithdrawn(roundId, msg.sender, recipient, amount);
    }

    /// @dev Forced native value stays unassigned. No owner rescue or token withdrawal.
    function unassignedNative() external view returns (uint256) { return address(this).balance - totalCredits; }
    // Conservation per round: provided + refunded = charged + credit + withdrawn.
    // No ticket collection, payout, swaps, rerolls, production deployment or key access.
}

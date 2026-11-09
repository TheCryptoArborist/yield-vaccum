// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {D20VRFConsumer} from "protocol/contracts/D20VRFConsumer.sol";
import {ID20VRF} from "protocol/contracts/interfaces/ID20VRF.sol";
import {RandomnessMapping} from "protocol/contracts/libraries/RandomnessMapping.sol";

interface IFixtureToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice LOCAL-ONLY RESEARCH. Not deployable on either public MSS2 chain.
/// @dev Payment tokens and coordinator are test fixtures. No production escrow,
/// refund policy, swaps, payout authorization, eligibility, or release approval.
contract DailyDrawPrototype is D20VRFConsumer {
    enum Phase { Missing, Open, Closed, Requested, RandomnessReady, WinnerSelected, Empty, Unfulfilled }
    struct Round {
        uint64 opensAt;
        uint64 closesAt;
        uint64 tickets;
        Phase phase;
        uint256 price;
        uint256 announcedPrize;
        uint256 requestId;
        bytes32 ticketDigest;
        bytes32 seed;
        bytes32 randomness;
        uint64 winningTicket; // Zero-based, strictly less than tickets.
        address winner;
    }
    struct Range { uint64 endExclusive; address owner; }
    uint32 public constant CALLBACK_GAS = 120_000;
    bytes32 public constant DOMAIN = keccak256("YIELD_VACUUM_DAILY_DRAW_RESEARCH_V1");
    address public immutable operator;
    address public immutable prizeSender;
    address public immutable rngFeeRefundRecipient;
    IFixtureToken public immutable payment;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Range[]) private ranges;
    mapping(uint256 => uint256) public requestRound;
    uint256 private entered = 1;

    error LocalOnly();
    error Unauthorized();
    error WrongPhase();
    error InvalidInput();
    error WrongFee();
    error Reentered();
    error WrongPayment();
    event TicketsRecorded(uint256 indexed roundId, address indexed owner, uint64 first, uint64 endExclusive, uint256 paid);
    event RoundClosed(uint256 indexed roundId, uint64 tickets, bytes32 ticketDigest);
    event PrizeCommitted(uint256 indexed roundId, uint256 amount, address sender);
    event DrawRequested(uint256 indexed roundId, uint256 indexed requestId, bytes32 seed);
    event RandomnessStored(uint256 indexed roundId, uint256 indexed requestId, bytes32 word);
    event WinnerSelected(uint256 indexed roundId, uint64 ticket, address indexed winner, uint256 announcedPrize);
    event RandomnessUnfulfilled(uint256 indexed roundId, uint256 indexed requestId);

    modifier onlyOperator() { if (msg.sender != operator) revert Unauthorized(); _; }
    modifier nonReentrant() { if (entered != 1) revert Reentered(); entered = 2; _; entered = 1; }

    constructor(address coordinator, address token, address sender, address refundRecipient)
        D20VRFConsumer(coordinator)
    {
        if (block.chainid != 31337 && block.chainid != 31338) revert LocalOnly();
        if (token.code.length == 0 || sender == address(0) || refundRecipient == address(0)) revert InvalidInput();
        operator = msg.sender;
        payment = IFixtureToken(token);
        prizeSender = sender;
        rngFeeRefundRecipient = refundRecipient;
    }

    function openRound(uint256 id, uint64 opensAt, uint64 closesAt, uint256 fixturePrice) external onlyOperator {
        if (id == 0 || rounds[id].phase != Phase.Missing || fixturePrice == 0 || closesAt <= opensAt || opensAt < block.timestamp)
            revert InvalidInput();
        Round storage r = rounds[id];
        r.opensAt = opensAt;
        r.closesAt = closesAt;
        r.price = fixturePrice;
        r.phase = Phase.Open;
    }

    function buyTickets(uint256 id, uint64 count) external nonReentrant {
        Round storage r = rounds[id];
        if (r.phase != Phase.Open || block.timestamp < r.opensAt || block.timestamp >= r.closesAt) revert WrongPhase();
        // The selected payout sender cannot gift a prize to itself.
        if (count == 0 || msg.sender == prizeSender) revert InvalidInput();
        uint64 first = r.tickets;
        uint64 end = first + count; // Checked overflow; no phantom or wrapped ticket ranges.
        uint256 cost = uint256(count) * r.price;
        uint256 beforeBalance = payment.balanceOf(address(this));
        if (!payment.transferFrom(msg.sender, address(this), cost) || payment.balanceOf(address(this)) - beforeBalance != cost)
            revert WrongPayment();
        r.tickets = end;
        ranges[id].push(Range(end, msg.sender));
        r.ticketDigest = keccak256(abi.encode(r.ticketDigest, id, msg.sender, first, end, cost));
        emit TicketsRecorded(id, msg.sender, first, end, cost);
    }

    function closeRound(uint256 id) external {
        Round storage r = rounds[id];
        if (r.phase != Phase.Open || block.timestamp < r.closesAt) revert WrongPhase();
        r.phase = r.tickets == 0 ? Phase.Empty : Phase.Closed;
        emit RoundClosed(id, r.tickets, r.ticketDigest);
    }

    /// @dev An immutable announced amount, NOT proof the external reserve is funded.
    function commitPrize(uint256 id, uint256 amount) external onlyOperator {
        Round storage r = rounds[id];
        if (r.phase != Phase.Closed || r.announcedPrize != 0) revert WrongPhase();
        if (amount < 1 ether) revert InvalidInput();
        r.announcedPrize = amount;
        emit PrizeCommitted(id, amount, prizeSender);
    }

    function requestDraw(uint256 id) external payable nonReentrant returns (uint256 requestId) {
        Round storage r = rounds[id];
        if (r.phase != Phase.Closed || r.announcedPrize == 0) revert WrongPhase();
        ID20VRF rng = ID20VRF(vrfCoordinator);
        uint256 fee = rng.quoteFee(CALLBACK_GAS); // Same-transaction fee, no hardcoded production price.
        if (msg.value != fee) revert WrongFee(); // Exact-fee prototype; a buffered production UX is not implemented.
        r.seed = keccak256(abi.encode(DOMAIN, block.chainid, address(this), id, address(payment),
            r.opensAt, r.closesAt, r.price, r.tickets, r.ticketDigest, r.announcedPrize, prizeSender));
        r.phase = Phase.Requested; // Reverts atomically when coordinator rejects the request.
        requestId = rng.requestRandomness{value: fee}(r.seed, CALLBACK_GAS, rngFeeRefundRecipient);
        if (requestId == 0 || requestRound[requestId] != 0) revert InvalidInput();
        r.requestId = requestId;
        requestRound[requestId] = id;
        emit DrawRequested(id, requestId, r.seed);
    }

    function _fulfillRandomness(uint256 requestId, bytes32 word) internal override {
        uint256 id = requestRound[requestId];
        Round storage r = rounds[id];
        if (id == 0 || r.phase != Phase.Requested || r.requestId != requestId) revert WrongPhase();
        r.randomness = word; // Zero is a legitimate word; phase, not a sentinel, records fulfillment.
        r.phase = Phase.RandomnessReady;
        emit RandomnessStored(id, requestId, word);
    }

    function _onRefund(uint256 requestId) internal override {
        uint256 id = requestRound[requestId];
        Round storage r = rounds[id];
        if (id == 0 || r.phase != Phase.Requested || r.requestId != requestId) revert WrongPhase();
        r.phase = Phase.Unfulfilled;
        // Fee refund notification is NOT ticket refund confirmation and never enables rerolling.
        emit RandomnessUnfulfilled(id, requestId);
    }

    function selectWinner(uint256 id) external {
        Round storage r = rounds[id];
        if (r.phase != Phase.RandomnessReady) revert WrongPhase();
        // NumberRange avoids ChooseOne's 256-item limit. Sampling rejects the short residue prefix.
        RandomnessMapping.Spec memory spec = RandomnessMapping.Spec({
            operation: RandomnessMapping.Operation.NumberRange,
            lower: 0, upper: r.tickets - 1, count: 1, population: 0
        });
        uint256 ticket = RandomnessMapping.map(r.randomness, spec)[0];
        r.winningTicket = uint64(ticket);
        r.winner = ticketOwner(id, uint64(ticket));
        r.phase = Phase.WinnerSelected;
        emit WinnerSelected(id, r.winningTicket, r.winner, r.announcedPrize);
    }

    function ticketOwner(uint256 id, uint64 ticket) public view returns (address) {
        if (ticket >= rounds[id].tickets) revert InvalidInput();
        Range[] storage entries = ranges[id];
        uint256 lo;
        uint256 hi = entries.length;
        while (lo < hi) {
            uint256 mid = lo + (hi - lo) / 2;
            if (ticket < entries[mid].endExclusive) hi = mid;
            else lo = mid + 1;
        }
        return entries[lo].owner;
    }
    function rangeCount(uint256 id) external view returns (uint256) { return ranges[id].length; }
    function rangeAt(uint256 id, uint256 index) external view returns (Range memory) { return ranges[id][index]; }
    // Deliberately NO reroll, winner override, ticket edit, cancellation-after-request,
    // liquidity payout, token withdrawal, public-chain deployment or 'mark paid' function.
}

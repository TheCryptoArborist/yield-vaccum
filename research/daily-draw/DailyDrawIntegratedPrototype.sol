// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DailyDrawOperatingFeesPrototype} from "research/daily-draw/DailyDrawOperatingFeesPrototype.sol";
import {RandomnessMapping} from "protocol/contracts/libraries/RandomnessMapping.sol";

interface ILocalDrawToken {
    function balanceOf(address) external view returns (uint256);
    function allowance(address,address) external view returns (uint256);
    function approve(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);
}
/// @dev Test purchase boundary, NOT the production Topaz router ABI.
interface ILocalDrawPurchase {
    function buy(uint256 amountIn,uint256 minimumOut,uint256 deadline,address recipient) external returns (uint256);
}

/// @notice LOCAL-ONLY integrated ticket/fee/winner and funding-accounting research.
/// @dev No public deployment, participant refunds, developer withdrawal, stake payout,
/// mark-paid attestation or arbitrary execution. An external reserve is NOT escrow.
/// Earlier standalone prototypes are deliberately not inherited (no alternate request path).
contract DailyDrawIntegratedPrototype {
    enum Phase { Missing, Open, Closed, Funded, Authorized, Requested, Ready, AwardPending, Empty, Unfulfilled }
    struct Round {
        uint64 opensAt;
        uint64 closesAt;
        uint64 tickets;
        uint16 developerBps;
        Phase phase;
        address developerRecipient;
        uint256 price;
        uint256 received;
        uint256 developerAccrued;
        uint256 prizeBudget;
        uint256 spent;
        uint256 acquired;
        bytes32 ticketDigest;
        bytes32 lockedInputs;
        uint256 requestId;
        bytes32 word;
        uint64 winningTicket;
        address winner;
        uint256 awardOwed;
    }
    struct Range { uint64 endExclusive; address owner; }
    bytes32 public constant DOMAIN = keccak256("YIELD_VACUUM_INTEGRATED_DRAW_LOCAL_V1");
    address public immutable operator;
    address public immutable reserve;
    ILocalDrawToken public immutable payment;
    ILocalDrawToken public immutable prize;
    ILocalDrawPurchase public immutable purchase;
    DailyDrawOperatingFeesPrototype public immutable fees;
    uint256 public immutable protectedInitialReserve;
    uint256 public totalPaymentLiability;
    uint256 public totalPrizeLiability;
    mapping(uint256 => Round) private records;
    mapping(uint256 => Range[]) private ranges;
    uint256 private entered = 1;

    error LocalOnly(); error Unauthorized(); error WrongPhase(); error InvalidInput();
    error WrongPayment(); error WrongPurchase(); error Shortfall(); error Reentered();
    event TicketsRecorded(uint256 indexed roundId,address indexed buyer,uint64 first,uint64 endExclusive,uint256 amount);
    event Allocated(uint256 indexed roundId,uint256 received,uint256 developerAmount,uint256 purchaseBudget);
    event PrizePurchased(uint256 indexed roundId,uint256 spent,uint256 acquired,address reserve);
    event InputsLocked(uint256 indexed roundId,bytes32 indexed digest,address payer,uint256 maximumFee);
    event RequestLinked(uint256 indexed roundId,uint256 indexed requestId);
    event AwardPending(uint256 indexed roundId,uint64 ticket,address indexed winner,uint256 amount);
    event RoundUnfulfilled(uint256 indexed roundId,uint256 indexed requestId);

    modifier onlyOperator(){if(msg.sender!=operator)revert Unauthorized();_;}
    modifier nonReentrant(){if(entered!=1)revert Reentered();entered=2;_;entered=1;}

    constructor(address coordinator,address paymentToken,address prizeToken,address localPurchase,address prizeReserve){
        if(block.chainid!=31337&&block.chainid!=31338)revert LocalOnly();
        if(paymentToken.code.length==0||prizeToken.code.length==0||localPurchase.code.length==0||
            paymentToken==prizeToken||prizeReserve==address(0)||prizeReserve==address(this))revert InvalidInput();
        operator=msg.sender;reserve=prizeReserve;
        payment=ILocalDrawToken(paymentToken);prize=ILocalDrawToken(prizeToken);purchase=ILocalDrawPurchase(localPurchase);
        // Conservative fixture quarantine of ALL pre-existing reserve tokens. Not an audit of arcade obligations.
        protectedInitialReserve=prize.balanceOf(prizeReserve);
        fees=new DailyDrawOperatingFeesPrototype(coordinator,address(this));
    }

    function round(uint256 id) external view returns(Round memory){return records[id];}
    function accountingKey(uint256 id) public view returns(bytes32){
        return keccak256(abi.encode(DOMAIN,block.chainid,address(this),address(payment),address(prize),id));
    }
    function openRound(uint256 id,uint64 opensAt,uint64 closesAt,uint256 price,uint16 developerBps,address developerRecipient)
        external onlyOperator nonReentrant
    {
        if(id==0||records[id].phase!=Phase.Missing||opensAt<block.timestamp||closesAt<=opensAt||price==0||
            developerBps>=10000||developerRecipient==address(0))revert InvalidInput();
        Round storage r=records[id];r.opensAt=opensAt;r.closesAt=closesAt;r.price=price;
        r.developerBps=developerBps;r.developerRecipient=developerRecipient;r.phase=Phase.Open;
    }
    function buyTickets(uint256 id,uint64 count) external nonReentrant {
        Round storage r=records[id];
        if(r.phase!=Phase.Open||block.timestamp<r.opensAt||block.timestamp>=r.closesAt)revert WrongPhase();
        if(count==0||msg.sender==reserve)revert InvalidInput();
        uint64 first=r.tickets;uint64 end=first+count;uint256 cost=uint256(count)*r.price;
        uint256 beforeBalance=payment.balanceOf(address(this));
        if(!payment.transferFrom(msg.sender,address(this),cost)||payment.balanceOf(address(this))!=beforeBalance+cost)revert WrongPayment();
        r.tickets=end;r.received+=cost;totalPaymentLiability+=cost;
        ranges[id].push(Range(end,msg.sender));
        r.ticketDigest=keccak256(abi.encode(r.ticketDigest,accountingKey(id),msg.sender,first,end,cost));
        emit TicketsRecorded(id,msg.sender,first,end,cost);
    }
    function closeRound(uint256 id) external nonReentrant {
        Round storage r=records[id];
        if(r.phase!=Phase.Open||block.timestamp<r.closesAt)revert WrongPhase();
        if(r.tickets==0){r.phase=Phase.Empty;return;}
        // Round once on aggregate receipts; any indivisible base-unit remainder belongs to the prize budget.
        r.developerAccrued=r.received/10000*r.developerBps+r.received%10000*r.developerBps/10000;
        r.prizeBudget=r.received-r.developerAccrued;r.phase=Phase.Closed;
        emit Allocated(id,r.received,r.developerAccrued,r.prizeBudget);
    }
    function acquirePrize(uint256 id,uint256 minimumOut,uint256 deadline) external onlyOperator nonReentrant {
        Round storage r=records[id];
        if(r.phase!=Phase.Closed)revert WrongPhase();
        if(minimumOut<1 ether||deadline<block.timestamp||r.prizeBudget==0)revert InvalidInput();
        uint256 beforePayment=payment.balanceOf(address(this));uint256 beforePrize=prize.balanceOf(reserve);
        if(beforePayment<totalPaymentLiability||beforePrize<protectedInitialReserve+totalPrizeLiability)revert Shortfall();
        uint256 input=r.prizeBudget;
        // This narrow fixture adapter never receives a generic calldata target or unlimited approval.
        if(!payment.approve(address(purchase),0)||!payment.approve(address(purchase),input))revert WrongPurchase();
        uint256 reported=purchase.buy(input,minimumOut,deadline,reserve);
        if(!payment.approve(address(purchase),0))revert WrongPurchase();
        uint256 afterPayment=payment.balanceOf(address(this));uint256 afterPrize=prize.balanceOf(reserve);
        if(afterPayment!=beforePayment-input||afterPrize<beforePrize+minimumOut||
            reported!=afterPrize-beforePrize||payment.allowance(address(this),address(purchase))!=0)revert WrongPurchase();
        r.spent=input;r.acquired=afterPrize-beforePrize;r.phase=Phase.Funded;
        totalPaymentLiability-=input;totalPrizeLiability+=r.acquired;
        emit PrizePurchased(id,input,r.acquired,reserve);
    }
    function authorizeDraw(uint256 id,address payer,uint256 maximumFee) external onlyOperator nonReentrant {
        Round storage r=records[id];if(r.phase!=Phase.Funded)revert WrongPhase();
        if(payer==address(0)||payer==address(this)||payer==address(fees)||maximumFee==0)revert InvalidInput();
        if(payment.balanceOf(address(this))<totalPaymentLiability||prize.balanceOf(reserve)<protectedInitialReserve+totalPrizeLiability)revert Shortfall();
        r.lockedInputs=keccak256(abi.encode(accountingKey(id),address(purchase),reserve,
            r.opensAt,r.closesAt,r.price,r.tickets,r.ticketDigest,r.received,r.developerBps,r.developerRecipient,
            r.developerAccrued,r.prizeBudget,r.spent,r.acquired,payer,maximumFee,address(fees)));
        r.phase=Phase.Authorized;
        fees.authorizeBudget(id,payer,maximumFee,r.lockedInputs);
        emit InputsLocked(id,r.lockedInputs,payer,maximumFee);
    }
    function _budget(uint256 id) private view returns(DailyDrawOperatingFeesPrototype.Budget memory b){
        (b.payer,b.maximumFee,b.lockedInputs,b.phase,b.requestId,b.provided,b.charged,b.refundable,
            b.refundAccount,b.credit,b.refunded,b.withdrawn,b.word,b.refundCollected)=fees.budgets(id);
    }
    /// @notice Permissionless pull of an authenticated stored result. No caller supplies a word or winner.
    /// A delayed sync must never change the result or authorize a replacement request.
    function syncResult(uint256 id) external nonReentrant {
        Round storage r=records[id];
        if(r.phase!=Phase.Authorized&&r.phase!=Phase.Requested)revert WrongPhase();
        DailyDrawOperatingFeesPrototype.Budget memory b=_budget(id);
        if(b.lockedInputs!=r.lockedInputs||b.requestId==0||fees.requestRound(b.requestId)!=id)revert WrongPhase();
        if(r.requestId!=0&&r.requestId!=b.requestId)revert InvalidInput();
        if(r.requestId==0){r.requestId=b.requestId;emit RequestLinked(id,b.requestId);}
        if(b.phase==DailyDrawOperatingFeesPrototype.Phase.Ready){r.word=b.word;r.phase=Phase.Ready;}
        else if(b.phase==DailyDrawOperatingFeesPrototype.Phase.Unfulfilled){
            r.phase=Phase.Unfulfilled;emit RoundUnfulfilled(id,b.requestId);
        }else if(b.phase==DailyDrawOperatingFeesPrototype.Phase.Requested){r.phase=Phase.Requested;}
        else revert WrongPhase();
    }
    function selectWinner(uint256 id) external nonReentrant {
        Round storage r=records[id];if(r.phase!=Phase.Ready)revert WrongPhase();
        RandomnessMapping.Spec memory spec=RandomnessMapping.Spec({operation:RandomnessMapping.Operation.NumberRange,
            lower:0,upper:r.tickets-1,count:1,population:0});
        r.winningTicket=uint64(RandomnessMapping.map(r.word,spec)[0]);
        r.winner=ticketOwner(id,r.winningTicket);r.awardOwed=r.acquired;r.phase=Phase.AwardPending;
        // Do NOT gate winner selection on wallet solvency: retain the winner even after an external reserve depletion.
        // No liability reduction until a future independently reviewed exact-stake-credit reconciliation exists.
        emit AwardPending(id,r.winningTicket,r.winner,r.awardOwed);
    }
    function ticketOwner(uint256 id,uint64 ticket) public view returns(address){
        if(ticket>=records[id].tickets)revert InvalidInput();
        Range[] storage list=ranges[id];uint256 lo;uint256 hi=list.length;
        while(lo<hi){uint256 mid=lo+(hi-lo)/2;if(ticket<list[mid].endExclusive)hi=mid;else lo=mid+1;}
        return list[lo].owner;
    }
    function rangeCount(uint256 id) external view returns(uint256){return ranges[id].length;}
    function rangeAt(uint256 id,uint256 index) external view returns(Range memory){return ranges[id][index];}
    function reserveCoverage() external view returns(uint256 balance,uint256 required,uint256 shortfall){
        balance=prize.balanceOf(reserve);required=protectedInitialReserve+totalPrizeLiability;
        shortfall=balance<required?required-balance:0;
    }
    // Per round: received = developerAccrued + (prizeBudget-spent) + spent after close.
    // Prize acquired remains a liability, including an unfulfilled randomness request.
    // Deliberately NO receive(), requestDraw(), rawFulfillRandomness(), reroll, payout,
    // developer withdrawal, markPaid(), sweep, participant refund or production deployment.
}

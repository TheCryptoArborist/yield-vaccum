// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IAdapterToken {
    function balanceOf(address) external view returns (uint256);
    function allowance(address,address) external view returns (uint256);
    function transferFrom(address,address,uint256) external returns (bool);
    function approve(address,uint256) external returns (bool);
}
interface IAdapterRouter {
    struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }
    function exactInput(ExactInputParams calldata) external payable returns (uint256);
}

/// @notice LOCAL-ONLY fixed-route adapter. Not a production deployment or approved trade policy.
/// @dev Constructor pins controller (predicted deployment address), reserve, tokens and router.
/// No generic target/calldata, native funding, token sweep or administrator replacement.
/// Source chain ID selects reviewed route data; execution remains on local IDs only.
contract DailyDrawTopazPurchasePrototype {
    address public constant MSS2 = 0x091F0c7e675A787A4018eb47c30BeD3FA2013B65;
    address public constant ROUTER = 0x2e7395A6E0De6eE1f390bEcE891069Cd18Ff8572;
    address public constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address public immutable controller;
    address public immutable reserve;
    address public immutable paymentToken;
    uint256 public immutable sourceChainId;
    bytes public path;
    uint256 private entered = 1;
    error LocalOnly(); error Unauthorized(); error InvalidInput(); error WrongTransfer(); error WrongSwap(); error Reentered();

    constructor(uint256 origin,address expectedController,address recipient) {
        if (!((origin==4663&&block.chainid==31337)||(origin==5042&&block.chainid==31338))) revert LocalOnly();
        if (expectedController==address(0)||recipient==address(0)||expectedController==recipient) revert InvalidInput();
        sourceChainId=origin;controller=expectedController;reserve=recipient;
        address input=origin==4663?0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168:0x3600000000000000000000000000000000000000;
        if (input.code.length==0||MSS2.code.length==0||ROUTER.code.length==0) revert InvalidInput();
        paymentToken=input;
        path=origin==4663?abi.encodePacked(input,int24(50),WETH,int24(2000),MSS2):abi.encodePacked(input,int24(2000),MSS2);
    }

    /// @notice Implements the draw's narrow buy boundary using the actual SwapRouter ABI.
    /// The controller supplies its own approved payment tokens; gas payer remains external.
    function buy(uint256 amountIn,uint256 minimumOut,uint256 deadline,address recipient) external returns(uint256 received) {
        if (msg.sender!=controller) revert Unauthorized();
        if (entered!=1) revert Reentered();entered=2;
        if (amountIn==0||minimumOut==0||deadline<block.timestamp||recipient!=reserve) revert InvalidInput();
        IAdapterToken input=IAdapterToken(paymentToken);IAdapterToken output=IAdapterToken(MSS2);
        uint256 inputBefore=input.balanceOf(address(this));
        uint256 reserveBefore=output.balanceOf(reserve);
        if (!input.transferFrom(controller,address(this),amountIn)||input.balanceOf(address(this))!=inputBefore+amountIn) revert WrongTransfer();
        if (!input.approve(ROUTER,0)||!input.approve(ROUTER,amountIn)) revert WrongTransfer();
        uint256 reported=IAdapterRouter(ROUTER).exactInput(IAdapterRouter.ExactInputParams(path,reserve,deadline,amountIn,minimumOut));
        if (!input.approve(ROUTER,0)) revert WrongTransfer();
        uint256 reserveAfter=output.balanceOf(reserve);
        if (reserveAfter<reserveBefore) revert WrongSwap();
        received=reserveAfter-reserveBefore;
        if (received<minimumOut||received!=reported||input.balanceOf(address(this))!=inputBefore||input.allowance(address(this),ROUTER)!=0) revert WrongSwap();
        entered=1;
    }
}

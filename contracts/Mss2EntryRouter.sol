// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title Yield Vacuum MSS2 Entry Router
/// @notice Splits one MSS2 arcade entry directly between the permanent dead
///         address and the designated Community Airdrop Reserve.
/// @dev This contract has no owner, upgrade path, withdrawal function, or
///      token custody. The caller must approve exactly enough MSS2 before entry.
contract Mss2EntryRouter {
    address public constant MSS2 = 0x091F0c7e675A787A4018eb47c30BeD3FA2013B65;
    address public constant DEAD_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    address public constant COMMUNITY_AIRDROP_RESERVE = 0xE8b63245DdDAB73C7A276818942341D8Cfb7D7A7;

    uint256 public constant DEAD_ADDRESS_BPS = 2_000;
    uint256 public constant COMMUNITY_AIRDROP_RESERVE_BPS = 8_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 paymentId => bool used) public usedPaymentIds;

    error InvalidPaymentId();
    error InvalidAmount();
    error PaymentIdAlreadyUsed(bytes32 paymentId);
    error TokenCallFailed();
    error UnexpectedTransferAmount();
    error NativeCurrencyNotAccepted();

    event EntryPaid(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed token,
        uint256 totalAmount,
        uint256 deadAddressAmount,
        uint256 communityReserveAmount
    );

    /// @notice Pay one arcade entry using a server-issued payment identifier.
    /// @param paymentId Unique bytes32 identifier bound to the quoted game run.
    /// @param totalAmount Exact raw 18-decimal MSS2 amount quoted by the server.
    function enter(bytes32 paymentId, uint256 totalAmount) external {
        if (paymentId == bytes32(0)) revert InvalidPaymentId();
        if (totalAmount < 5) revert InvalidAmount();
        if (usedPaymentIds[paymentId]) revert PaymentIdAlreadyUsed(paymentId);

        uint256 deadAddressAmount = (totalAmount * DEAD_ADDRESS_BPS) / BPS_DENOMINATOR;
        uint256 communityReserveAmount = totalAmount - deadAddressAmount;
        usedPaymentIds[paymentId] = true;

        uint256 deadBalanceBefore = _balanceOf(DEAD_ADDRESS);
        uint256 reserveBalanceBefore = _balanceOf(COMMUNITY_AIRDROP_RESERVE);

        _safeTransferFrom(msg.sender, DEAD_ADDRESS, deadAddressAmount);
        _safeTransferFrom(msg.sender, COMMUNITY_AIRDROP_RESERVE, communityReserveAmount);

        if (
            _balanceOf(DEAD_ADDRESS) - deadBalanceBefore != deadAddressAmount
                || _balanceOf(COMMUNITY_AIRDROP_RESERVE) - reserveBalanceBefore != communityReserveAmount
        ) revert UnexpectedTransferAmount();

        emit EntryPaid(
            paymentId,
            msg.sender,
            MSS2,
            totalAmount,
            deadAddressAmount,
            communityReserveAmount
        );
    }

    function _safeTransferFrom(address from, address to, uint256 amount) private {
        (bool success, bytes memory returnData) = MSS2.call(
            abi.encodeWithSelector(bytes4(keccak256("transferFrom(address,address,uint256)")), from, to, amount)
        );
        if (!success || (returnData.length != 0 && !abi.decode(returnData, (bool)))) revert TokenCallFailed();
    }

    function _balanceOf(address account) private view returns (uint256 balance) {
        (bool success, bytes memory returnData) = MSS2.staticcall(
            abi.encodeWithSelector(bytes4(keccak256("balanceOf(address)")), account)
        );
        if (!success || returnData.length < 32) revert TokenCallFailed();
        balance = abi.decode(returnData, (uint256));
    }

    receive() external payable {
        revert NativeCurrencyNotAccepted();
    }

    fallback() external payable {
        revert NativeCurrencyNotAccepted();
    }
}

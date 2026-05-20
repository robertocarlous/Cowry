// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IGroupRegistry} from "./interfaces/IGroupRegistry.sol";

/// @title CowryPay
/// @notice Pulls a whitelisted token from the payer and sends to one recipient or all
///         members of a group in a single tx. Supports multiple tokens (e.g. USDm, USDC).
contract CowryPay is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IGroupRegistry public immutable groupRegistry;

    mapping(address => bool) public supportedTokens;

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    error UnsupportedToken(address token);
    error GroupNotActive();
    error EmptyMemberList();

    modifier onlySupportedToken(address token) {
        if (!supportedTokens[token]) revert UnsupportedToken(token);
        _;
    }

    /// @param initialTokens List of token addresses to whitelist at deploy time.
    constructor(
        address[] memory initialTokens,
        IGroupRegistry _groupRegistry,
        address initialOwner
    ) Ownable(initialOwner) {
        groupRegistry = _groupRegistry;
        for (uint256 i = 0; i < initialTokens.length; i++) {
            supportedTokens[initialTokens[i]] = true;
            emit TokenAdded(initialTokens[i]);
        }
    }

    // ── Owner token management ───────────────────────────────────────────────

    function addToken(address token) external onlyOwner {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    // ── Payment functions ────────────────────────────────────────────────────

    /// @notice Send `amount` of `token` from caller to `to`.
    function pay(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant whenNotPaused onlySupportedToken(token) {
        IERC20(token).safeTransferFrom(msg.sender, to, amount);
    }

    /// @notice Send `amountPerMember` of `token` to every group member.
    ///         Total pulled = `amountPerMember * n`.
    function payGroupEqual(
        address token,
        uint256 groupId,
        uint256 amountPerMember
    ) external nonReentrant whenNotPaused onlySupportedToken(token) {
        if (!groupRegistry.isActive(groupId)) revert GroupNotActive();
        address[] memory members = groupRegistry.getMembers(groupId);
        uint256 n = members.length;
        if (n == 0) revert EmptyMemberList();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountPerMember * n);
        for (uint256 i = 0; i < n; i++) {
            IERC20(token).safeTransfer(members[i], amountPerMember);
        }
    }

    /// @notice Split `totalAmount` of `token` across group members.
    ///         Remainder from integer division goes to the first `rem` members (+1 wei each).
    function payGroupSplit(
        address token,
        uint256 groupId,
        uint256 totalAmount
    ) external nonReentrant whenNotPaused onlySupportedToken(token) {
        if (!groupRegistry.isActive(groupId)) revert GroupNotActive();
        address[] memory members = groupRegistry.getMembers(groupId);
        uint256 n = members.length;
        if (n == 0) revert EmptyMemberList();
        uint256 base = totalAmount / n;
        uint256 rem = totalAmount % n;
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);
        for (uint256 i = 0; i < n; i++) {
            IERC20(token).safeTransfer(members[i], base + (i < rem ? 1 : 0));
        }
    }

    // ── Emergency controls ───────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}

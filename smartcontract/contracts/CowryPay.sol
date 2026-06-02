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
///
///         v2: Adds an operator/agent pattern. A registered operator (e.g. the Cowry AI
///         agent) can call payOnBehalf / payGroupEqualOnBehalf / payGroupSplitOnBehalf to
///         execute payments on behalf of a user who has pre-approved this contract for
///         their tokens. This lets the AI agent be the on-chain actor — all payment txs
///         originate from the agent wallet, building real on-chain transaction volume.
contract CowryPay is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IGroupRegistry public immutable groupRegistry;

    mapping(address => bool) public supportedTokens;

    /// @notice Registered operators (e.g. Cowry AI agent wallet).
    ///         Operators can call payOnBehalf and related functions.
    mapping(address => bool) public operators;

    // ── Events ───────────────────────────────────────────────────────────────

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event OperatorSet(address indexed operator, bool enabled);

    // ── Errors ────────────────────────────────────────────────────────────────

    error UnsupportedToken(address token);
    error GroupNotActive();
    error EmptyMemberList();
    error NotOperator();

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlySupportedToken(address token) {
        if (!supportedTokens[token]) revert UnsupportedToken(token);
        _;
    }

    modifier onlyOperator() {
        if (!operators[msg.sender]) revert NotOperator();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param initialTokens  List of token addresses to whitelist at deploy time.
    /// @param initialOperators  List of operator addresses (e.g. agent wallet) at deploy time.
    constructor(
        address[] memory initialTokens,
        address[] memory initialOperators,
        IGroupRegistry _groupRegistry,
        address initialOwner
    ) Ownable(initialOwner) {
        groupRegistry = _groupRegistry;
        for (uint256 i = 0; i < initialTokens.length; i++) {
            supportedTokens[initialTokens[i]] = true;
            emit TokenAdded(initialTokens[i]);
        }
        for (uint256 i = 0; i < initialOperators.length; i++) {
            operators[initialOperators[i]] = true;
            emit OperatorSet(initialOperators[i], true);
        }
    }

    // ── Owner: token management ───────────────────────────────────────────────

    function addToken(address token) external onlyOwner {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    // ── Owner: operator management ────────────────────────────────────────────

    /// @notice Register or revoke an operator (e.g. the Cowry AI agent wallet).
    function setOperator(address operator, bool enabled) external onlyOwner {
        operators[operator] = enabled;
        emit OperatorSet(operator, enabled);
    }

    // ── Direct payment functions (caller pays) ────────────────────────────────

    /// @notice Send `amount` of `token` from caller to `to`.
    function pay(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant whenNotPaused onlySupportedToken(token) {
        IERC20(token).safeTransferFrom(msg.sender, to, amount);
    }

    /// @notice Send `amountPerMember` of `token` to every group member.
    ///         Total pulled from caller = `amountPerMember * n`.
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

    /// @notice Split `totalAmount` of `token` across group members (pulled from caller).
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

    // ── Agent-executed payment functions (operator pays on behalf of payer) ───
    //
    //  These are called by the Cowry AI agent wallet (an operator).
    //  The `payer` must have pre-approved this contract for at least `amount` of `token`.
    //  Funds flow: payer → recipient(s), initiated by the agent.
    //  This makes the agent the on-chain actor — all payment tx volume is on the agent.

    /// @notice Agent sends `amount` of `token` from `payer` to `to`.
    /// @param payer  The user whose tokens are pulled (must have approved this contract).
    function payOnBehalf(
        address payer,
        address token,
        address to,
        uint256 amount
    ) external nonReentrant whenNotPaused onlySupportedToken(token) onlyOperator {
        IERC20(token).safeTransferFrom(payer, to, amount);
    }

    /// @notice Agent sends `amountPerMember` of `token` from `payer` to every group member.
    ///         Total pulled from `payer` = `amountPerMember * n`.
    /// @param payer  The user whose tokens are pulled (must have approved this contract).
    function payGroupEqualOnBehalf(
        address payer,
        address token,
        uint256 groupId,
        uint256 amountPerMember
    ) external nonReentrant whenNotPaused onlySupportedToken(token) onlyOperator {
        if (!groupRegistry.isActive(groupId)) revert GroupNotActive();
        address[] memory members = groupRegistry.getMembers(groupId);
        uint256 n = members.length;
        if (n == 0) revert EmptyMemberList();
        IERC20(token).safeTransferFrom(payer, address(this), amountPerMember * n);
        for (uint256 i = 0; i < n; i++) {
            IERC20(token).safeTransfer(members[i], amountPerMember);
        }
    }

    /// @notice Agent splits `totalAmount` of `token` from `payer` across group members.
    ///         Remainder from integer division goes to the first `rem` members (+1 wei each).
    /// @param payer  The user whose tokens are pulled (must have approved this contract).
    function payGroupSplitOnBehalf(
        address payer,
        address token,
        uint256 groupId,
        uint256 totalAmount
    ) external nonReentrant whenNotPaused onlySupportedToken(token) onlyOperator {
        if (!groupRegistry.isActive(groupId)) revert GroupNotActive();
        address[] memory members = groupRegistry.getMembers(groupId);
        uint256 n = members.length;
        if (n == 0) revert EmptyMemberList();
        uint256 base = totalAmount / n;
        uint256 rem = totalAmount % n;
        IERC20(token).safeTransferFrom(payer, address(this), totalAmount);
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

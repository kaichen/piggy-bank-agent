// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "./utils/Ownable.sol";
import {SafeTransferLib} from "./utils/SafeTransferLib.sol";

contract VaultManager is Ownable {
    using SafeTransferLib for address;

    error VaultNotFound();
    error VaultAlreadyBroken();
    error UnlockTimestampNotInFuture();
    error TokenNotWhitelisted();
    error AmountIsZero();
    error InsufficientFees();
    error NotVaultOwner();
    error LengthMismatch();

    event TokenWhitelistUpdated(address indexed token, bool allowed);
    event VaultCreated(uint256 indexed vaultId, address indexed owner, uint64 unlockTimestamp);
    event Deposited(uint256 indexed vaultId, address indexed depositor, address indexed token, uint256 amount);
    event VaultBroken(uint256 indexed vaultId, address indexed owner, bool matured);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant EARLY_BREAK_FEE_BPS = 500;

    struct Vault {
        address owner;
        uint64 unlockTimestamp;
        bool broken;
    }

    Vault[] private vaults;

    mapping(address token => bool allowed) public isTokenWhitelisted;
    address[] private whitelistedTokens;
    mapping(address token => uint256 indexPlusOne) private whitelistedTokenIndexPlusOne;
    mapping(uint256 vaultId => mapping(address token => uint256 balance)) public vaultTokenBalance;
    mapping(uint256 vaultId => address[] tokens) private vaultTokens;
    mapping(uint256 vaultId => mapping(address token => bool seen)) private vaultTokenSeen;
    mapping(address token => uint256 amount) public protocolFees;
    mapping(address owner => uint256[] vaultIds) private vaultIdsByOwner;

    constructor() {
        vaults.push(Vault({owner: address(0), unlockTimestamp: 0, broken: true}));
    }

    function vaultCount() external view returns (uint256) {
        return vaults.length - 1;
    }

    function getVault(uint256 vaultId) external view returns (Vault memory) {
        _requireVaultExists(vaultId);
        return vaults[vaultId];
    }

    function getVaultTokens(uint256 vaultId) external view returns (address[] memory) {
        _requireVaultExists(vaultId);
        return vaultTokens[vaultId];
    }

    function getVaultIdsByOwner(address vaultOwner) external view returns (uint256[] memory) {
        return vaultIdsByOwner[vaultOwner];
    }

    function getWhitelistedTokens() external view returns (address[] memory) {
        return whitelistedTokens;
    }

    function setTokenWhitelist(address token, bool allowed) external onlyOwner {
        bool current = isTokenWhitelisted[token];
        if (current == allowed) {
            emit TokenWhitelistUpdated(token, allowed);
            return;
        }

        isTokenWhitelisted[token] = allowed;

        if (allowed) {
            if (whitelistedTokenIndexPlusOne[token] == 0) {
                whitelistedTokens.push(token);
                whitelistedTokenIndexPlusOne[token] = whitelistedTokens.length;
            }
        } else {
            uint256 indexPlusOne = whitelistedTokenIndexPlusOne[token];
            if (indexPlusOne != 0) {
                uint256 index = indexPlusOne - 1;
                uint256 lastIndex = whitelistedTokens.length - 1;
                if (index != lastIndex) {
                    address lastToken = whitelistedTokens[lastIndex];
                    whitelistedTokens[index] = lastToken;
                    whitelistedTokenIndexPlusOne[lastToken] = index + 1;
                }
                whitelistedTokens.pop();
                whitelistedTokenIndexPlusOne[token] = 0;
            }
        }

        emit TokenWhitelistUpdated(token, allowed);
    }

    function createVault(uint64 unlockTimestamp) external returns (uint256 vaultId) {
        return _createVault(unlockTimestamp, msg.sender);
    }

    function createVaultAndDeposit(
        uint64 unlockTimestamp,
        address token,
        uint256 amount
    ) external returns (uint256 vaultId) {
        vaultId = _createVault(unlockTimestamp, msg.sender);
        _deposit(vaultId, token, amount, msg.sender);
    }

    function createVaultAndDepositBatch(
        uint64 unlockTimestamp,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (uint256 vaultId) {
        if (tokens.length != amounts.length) revert LengthMismatch();
        vaultId = _createVault(unlockTimestamp, msg.sender);
        for (uint256 i = 0; i < tokens.length; i++) {
            _deposit(vaultId, tokens[i], amounts[i], msg.sender);
        }
    }

    function deposit(uint256 vaultId, address token, uint256 amount) external {
        _deposit(vaultId, token, amount, msg.sender);
    }

    function breakVault(uint256 vaultId) external {
        _requireVaultExists(vaultId);
        Vault storage vault = vaults[vaultId];
        if (vault.broken) revert VaultAlreadyBroken();
        if (msg.sender != vault.owner) revert NotVaultOwner();

        bool matured = block.timestamp >= vault.unlockTimestamp;
        address[] storage tokens = vaultTokens[vaultId];

        vault.broken = true;

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 balance = vaultTokenBalance[vaultId][token];
            if (balance == 0) continue;

            vaultTokenBalance[vaultId][token] = 0;

            uint256 payout = balance;
            if (!matured) {
                uint256 fee = (balance * EARLY_BREAK_FEE_BPS) / BPS_DENOMINATOR;
                payout = balance - fee;
                protocolFees[token] += fee;
            }

            token.safeTransfer(vault.owner, payout);
        }

        emit VaultBroken(vaultId, vault.owner, matured);
    }

    function withdrawFees(address token, address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert AmountIsZero();
        uint256 available = protocolFees[token];
        if (amount > available) revert InsufficientFees();
        protocolFees[token] = available - amount;
        token.safeTransfer(to, amount);
        emit FeesWithdrawn(token, to, amount);
    }

    function _createVault(uint64 unlockTimestamp, address vaultOwner) internal returns (uint256 vaultId) {
        if (unlockTimestamp <= block.timestamp) revert UnlockTimestampNotInFuture();
        vaultId = vaults.length;
        vaults.push(Vault({owner: vaultOwner, unlockTimestamp: unlockTimestamp, broken: false}));
        vaultIdsByOwner[vaultOwner].push(vaultId);
        emit VaultCreated(vaultId, vaultOwner, unlockTimestamp);
    }

    function _deposit(uint256 vaultId, address token, uint256 amount, address from) internal {
        _requireVaultExists(vaultId);
        Vault storage vault = vaults[vaultId];
        if (vault.broken) revert VaultAlreadyBroken();
        if (!isTokenWhitelisted[token]) revert TokenNotWhitelisted();
        if (amount == 0) revert AmountIsZero();

        token.safeTransferFrom(from, address(this), amount);

        if (!vaultTokenSeen[vaultId][token]) {
            vaultTokenSeen[vaultId][token] = true;
            vaultTokens[vaultId].push(token);
        }

        vaultTokenBalance[vaultId][token] += amount;
        emit Deposited(vaultId, from, token, amount);
    }

    function _requireVaultExists(uint256 vaultId) internal view {
        if (vaultId == 0 || vaultId >= vaults.length) revert VaultNotFound();
    }
}

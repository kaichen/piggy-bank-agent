// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VaultManager} from "../src/VaultManager.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {TestBase} from "./utils/TestBase.sol";

contract VaultManagerTest is TestBase {
    VaultManager private manager;
    MockERC20 private tokenA;
    MockERC20 private tokenB;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant TREASURY = address(0xBEEF);

    function setUp() public {
        manager = new VaultManager();
        tokenA = new MockERC20("TokenA", "A", 18);
        tokenB = new MockERC20("TokenB", "B", 6);

        manager.setTokenWhitelist(address(tokenA), true);
        manager.setTokenWhitelist(address(tokenB), true);

        tokenA.mint(ALICE, 1_000 ether);
        tokenA.mint(BOB, 1_000 ether);
        tokenB.mint(ALICE, 1_000_000_000);
    }

    function testCreateVaultAndDeposit_SingleCall() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 7 days);

        vm.startPrank(ALICE);
        tokenA.approve(address(manager), 100 ether);
        uint256 vaultId = manager.createVaultAndDeposit(unlockTimestamp, address(tokenA), 100 ether);
        vm.stopPrank();

        assertEq(manager.vaultTokenBalance(vaultId, address(tokenA)), 100 ether, "vault balance");
    }

    function testAnyoneCanDeposit_BreakAfterMaturity_NoFee() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 7 days);

        vm.startPrank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);
        tokenA.approve(address(manager), 100 ether);
        manager.deposit(vaultId, address(tokenA), 100 ether);
        vm.stopPrank();

        vm.startPrank(BOB);
        tokenA.approve(address(manager), 50 ether);
        manager.deposit(vaultId, address(tokenA), 50 ether);
        vm.stopPrank();

        vm.warp(unlockTimestamp);

        uint256 aliceBefore = tokenA.balanceOf(ALICE);
        vm.prank(ALICE);
        manager.breakVault(vaultId);
        uint256 aliceAfter = tokenA.balanceOf(ALICE);

        assertEq(aliceAfter - aliceBefore, 150 ether, "payout");
        assertEq(manager.protocolFees(address(tokenA)), 0, "fees");
    }

    function testBreakEarly_TakesFee_WithdrawableByContractOwner() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 30 days);

        vm.startPrank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);
        tokenA.approve(address(manager), 200 ether);
        manager.deposit(vaultId, address(tokenA), 200 ether);
        vm.stopPrank();

        uint256 aliceBefore = tokenA.balanceOf(ALICE);
        vm.prank(ALICE);
        manager.breakVault(vaultId);
        uint256 aliceAfter = tokenA.balanceOf(ALICE);

        uint256 fee = (200 ether * manager.EARLY_BREAK_FEE_BPS()) / manager.BPS_DENOMINATOR();
        assertEq(aliceAfter - aliceBefore, 200 ether - fee, "payout");
        assertEq(manager.protocolFees(address(tokenA)), fee, "fees recorded");
        assertEq(tokenA.balanceOf(address(manager)), fee, "fees held");

        manager.withdrawFees(address(tokenA), TREASURY, fee);
        assertEq(tokenA.balanceOf(TREASURY), fee, "treasury received");
        assertEq(manager.protocolFees(address(tokenA)), 0, "fees cleared");
    }

    function testBreakOnlyVaultOwner() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 7 days);

        vm.prank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);

        vm.prank(BOB);
        vm.expectRevert(VaultManager.NotVaultOwner.selector);
        manager.breakVault(vaultId);
    }

    function testDepositRequiresWhitelist() public {
        MockERC20 tokenC = new MockERC20("TokenC", "C", 18);
        tokenC.mint(ALICE, 10 ether);

        uint64 unlockTimestamp = uint64(block.timestamp + 7 days);
        vm.prank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);

        vm.startPrank(ALICE);
        tokenC.approve(address(manager), 1 ether);
        vm.expectRevert(VaultManager.TokenNotWhitelisted.selector);
        manager.deposit(vaultId, address(tokenC), 1 ether);
        vm.stopPrank();
    }

    function testBreakTransfersAllTokens() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 1 days);

        vm.startPrank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);
        tokenA.approve(address(manager), 10 ether);
        tokenB.approve(address(manager), 123_000_000);
        manager.deposit(vaultId, address(tokenA), 10 ether);
        manager.deposit(vaultId, address(tokenB), 123_000_000);
        vm.stopPrank();

        vm.warp(unlockTimestamp);

        uint256 aliceABefore = tokenA.balanceOf(ALICE);
        uint256 aliceBBefore = tokenB.balanceOf(ALICE);

        vm.prank(ALICE);
        manager.breakVault(vaultId);

        assertEq(tokenA.balanceOf(ALICE) - aliceABefore, 10 ether, "tokenA");
        assertEq(tokenB.balanceOf(ALICE) - aliceBBefore, 123_000_000, "tokenB");
    }

    function testWithdrawFeesOnlyContractOwner() public {
        uint64 unlockTimestamp = uint64(block.timestamp + 7 days);

        vm.startPrank(ALICE);
        uint256 vaultId = manager.createVault(unlockTimestamp);
        tokenA.approve(address(manager), 100 ether);
        manager.deposit(vaultId, address(tokenA), 100 ether);
        manager.breakVault(vaultId);
        vm.stopPrank();

        uint256 fee = manager.protocolFees(address(tokenA));

        vm.prank(ALICE);
        vm.expectRevert();
        manager.withdrawFees(address(tokenA), ALICE, fee);
    }
}

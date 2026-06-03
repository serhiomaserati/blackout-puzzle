// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BaseBlastLeaderboard} from "../src/BaseBlastLeaderboard.sol";

contract BaseBlastLeaderboardTest is Test {
    BaseBlastLeaderboard internal lb;

    uint256 internal constant SIGNER_PK = 0xA11CE;
    address internal signer;
    address internal owner = address(0xB0B);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);
    address internal carol = address(0xC3);

    function setUp() public {
        signer = vm.addr(SIGNER_PK);
        lb = new BaseBlastLeaderboard(owner, signer);
    }

    // Подписать (player, score, nonce) ключом верификатора.
    function _sign(
        uint256 pk,
        address player,
        uint256 score,
        uint256 nonce
    ) internal view returns (bytes memory) {
        bytes32 digest = lb.hashScore(player, score, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _submit(
        address player,
        uint256 score,
        uint256 nonce
    ) internal {
        bytes memory sig = _sign(SIGNER_PK, player, score, nonce);
        vm.prank(player);
        lb.submitScore(score, nonce, sig);
    }

    function test_ValidSubmissionSetsBestAndTop() public {
        _submit(alice, 1000, 1);
        assertEq(lb.bestScore(alice), 1000);
        BaseBlastLeaderboard.Entry[] memory top = lb.getTop();
        assertEq(top.length, 1);
        assertEq(top[0].player, alice);
        assertEq(top[0].score, 1000);
    }

    function test_OnlyHigherScoreUpdatesBest() public {
        _submit(alice, 1000, 1);
        _submit(alice, 500, 2); // ниже — не должен перезаписать
        assertEq(lb.bestScore(alice), 1000);
        _submit(alice, 1500, 3); // выше — обновляет
        assertEq(lb.bestScore(alice), 1500);
        BaseBlastLeaderboard.Entry[] memory top = lb.getTop();
        assertEq(top.length, 1);
        assertEq(top[0].score, 1500);
    }

    function test_RevertOnReplay() public {
        bytes memory sig = _sign(SIGNER_PK, alice, 1000, 1);
        vm.prank(alice);
        lb.submitScore(1000, 1, sig);
        vm.prank(alice);
        vm.expectRevert(BaseBlastLeaderboard.SignatureAlreadyUsed.selector);
        lb.submitScore(1000, 1, sig);
    }

    function test_RevertOnWrongSigner() public {
        bytes memory sig = _sign(0xBADBAD, alice, 1000, 1); // чужой ключ
        vm.prank(alice);
        vm.expectRevert(BaseBlastLeaderboard.InvalidSignature.selector);
        lb.submitScore(1000, 1, sig);
    }

    function test_RevertWhenAnotherPlayerStealsSignature() public {
        // Подпись выписана на alice; bob пытается воспользоваться ей.
        bytes memory sig = _sign(SIGNER_PK, alice, 9999, 1);
        vm.prank(bob);
        vm.expectRevert(BaseBlastLeaderboard.InvalidSignature.selector);
        lb.submitScore(9999, 1, sig);
    }

    function test_TopOrdersDescendingAcrossPlayers() public {
        _submit(alice, 1000, 1);
        _submit(bob, 3000, 1);
        _submit(carol, 2000, 1);
        BaseBlastLeaderboard.Entry[] memory top = lb.getTop();
        assertEq(top.length, 3);
        assertEq(top[0].player, bob);
        assertEq(top[0].score, 3000);
        assertEq(top[1].player, carol);
        assertEq(top[2].player, alice);
    }

    function test_PlayerImprovementReordersTopWithoutDuplicate() public {
        _submit(alice, 1000, 1);
        _submit(bob, 2000, 1);
        _submit(alice, 5000, 2); // alice обгоняет bob, без дубля
        BaseBlastLeaderboard.Entry[] memory top = lb.getTop();
        assertEq(top.length, 2);
        assertEq(top[0].player, alice);
        assertEq(top[0].score, 5000);
        assertEq(top[1].player, bob);
    }

    function test_OnlyOwnerCanRotateSigner() public {
        vm.prank(alice);
        vm.expectRevert();
        lb.setTrustedSigner(alice);

        vm.prank(owner);
        lb.setTrustedSigner(carol);
        assertEq(lb.trustedSigner(), carol);
    }

    function testFuzz_BestIsMonotonicMax(uint96[8] memory scores) public {
        uint256 expected;
        for (uint256 i; i < scores.length; ++i) {
            uint256 sc = uint256(scores[i]);
            _submit(alice, sc, i + 1);
            if (sc > expected) expected = sc;
            assertEq(lb.bestScore(alice), expected);
        }
    }
}

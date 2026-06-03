// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title Base Blast — onchain leaderboard with server-verified scores.
/// @notice Anti-cheat: a score is only accepted if signed (EIP-712) by the
///         trusted off-chain verifier, which re-simulates the run deterministically
///         before signing. The signature is bound to the player address and a
///         one-time nonce, so it can't be replayed or reused by another player.
contract BaseBlastLeaderboard is EIP712, Ownable {
    struct Entry {
        address player;
        uint256 score;
    }

    bytes32 private constant SCORE_TYPEHASH =
        keccak256("Score(address player,uint256 score,uint256 nonce)");

    uint256 public constant TOP_N = 10;

    /// @notice Address whose signatures the contract trusts (the verifier).
    address public trustedSigner;

    /// @notice Best score ever submitted per player.
    mapping(address => uint256) public bestScore;

    /// @notice Spent signature digests, to block replays.
    mapping(bytes32 => bool) public consumed;

    Entry[TOP_N] private _top;

    event TrustedSignerUpdated(address indexed signer);
    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 best,
        bool newBest
    );

    error InvalidSignature();
    error SignatureAlreadyUsed();
    error ZeroSigner();

    constructor(
        address initialOwner,
        address signer
    ) EIP712("BaseBlast", "1") Ownable(initialOwner) {
        if (signer == address(0)) revert ZeroSigner();
        trustedSigner = signer;
        emit TrustedSignerUpdated(signer);
    }

    /// @notice Rotate the trusted verifier signer.
    function setTrustedSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroSigner();
        trustedSigner = signer;
        emit TrustedSignerUpdated(signer);
    }

    /// @notice EIP-712 digest the verifier signs for a given run result.
    function hashScore(
        address player,
        uint256 score,
        uint256 nonce
    ) public view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(SCORE_TYPEHASH, player, score, nonce))
            );
    }

    /// @notice Submit a verifier-signed score for the caller.
    /// @dev Gasless for smart wallets via a Paymaster; caller is always the player.
    function submitScore(
        uint256 score,
        uint256 nonce,
        bytes calldata signature
    ) external {
        bytes32 digest = hashScore(msg.sender, score, nonce);
        if (consumed[digest]) revert SignatureAlreadyUsed();
        if (ECDSA.recover(digest, signature) != trustedSigner) {
            revert InvalidSignature();
        }
        consumed[digest] = true;

        uint256 prev = bestScore[msg.sender];
        bool newBest = score > prev;
        if (newBest) {
            bestScore[msg.sender] = score;
            _updateTop(msg.sender, score);
        }
        emit ScoreSubmitted(msg.sender, score, newBest ? score : prev, newBest);
    }

    /// @notice Current top players (descending), trimmed to filled slots.
    function getTop() external view returns (Entry[] memory list) {
        uint256 n;
        for (uint256 i; i < TOP_N; ++i) {
            if (_top[i].player == address(0)) break;
            ++n;
        }
        list = new Entry[](n);
        for (uint256 i; i < n; ++i) list[i] = _top[i];
    }

    /// @dev Remove the player's stale entry (if present) then insert by score desc.
    function _updateTop(address player, uint256 score) internal {
        uint256 idx = TOP_N;
        for (uint256 i; i < TOP_N; ++i) {
            if (_top[i].player == player) {
                idx = i;
                break;
            }
        }
        if (idx != TOP_N) {
            for (uint256 i = idx; i + 1 < TOP_N; ++i) _top[i] = _top[i + 1];
            _top[TOP_N - 1] = Entry(address(0), 0);
        }

        uint256 pos = TOP_N;
        for (uint256 i; i < TOP_N; ++i) {
            if (_top[i].player == address(0) || score > _top[i].score) {
                pos = i;
                break;
            }
        }
        if (pos == TOP_N) return; // didn't make the cut

        for (uint256 i = TOP_N - 1; i > pos; --i) _top[i] = _top[i - 1];
        _top[pos] = Entry(player, score);
    }
}

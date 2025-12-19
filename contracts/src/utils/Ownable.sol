// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

abstract contract Ownable {
    error NotOwner();
    error NewOwnerIsZeroAddress();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public owner;

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert NewOwnerIsZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

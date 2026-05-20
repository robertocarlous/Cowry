// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test double for USDm / Mento Dollar (18 decimals).
contract MockUSDM is ERC20 {
    constructor() ERC20("Mock USDm", "USDm") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

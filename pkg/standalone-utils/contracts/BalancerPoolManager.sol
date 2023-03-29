// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/ReentrancyGuard.sol";
import "@balancer-labs/v2-interfaces/contracts/solidity-utils/openzeppelin/IERC20.sol";

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

interface IPoolWithSwapFee {
    function setSwapFeePercentage(uint256 swapFeePercentage) external;
}

interface IStablePool {
    function startAmplificationParameterUpdate(uint256 rawEndValue, uint256 endTime) external;
    function stopAmplificationParameterUpdate() external;

    function setTokenRateCacheDuration(IERC20 token, uint256 duration) external;
}

contract BalancerPoolManager is ReentrancyGuard {
    // The owner of this contract
    address public immutable owner;

    // pool address -> user address -> canSetSwapFee
    mapping(address => mapping(address => bool)) private _swapFeeAuthMap;

    constructor(address _owner) {
        owner = _owner;
    }

    function setSwapFeePercentage(address poolAddress, uint256 swapFeePercentage) external nonReentrant {
        require(msg.sender == owner || _swapFeeAuthMap[poolAddress][msg.sender], "Sender not allowed");

        IPoolWithSwapFee(poolAddress).setSwapFeePercentage(swapFeePercentage);
    }

    function startAmplificationParameterUpdate(address poolAddress, uint256 rawEndValue, uint256 endTime)
        external
        nonReentrant
    {
        require(msg.sender == owner, "Sender not allowed");

        IStablePool(poolAddress).startAmplificationParameterUpdate(rawEndValue, endTime);
    }

    function stopAmplificationParameterUpdate(address poolAddress) external nonReentrant {
        require(msg.sender == owner, "Sender not allowed");

        IStablePool(poolAddress).stopAmplificationParameterUpdate();
    }

    function setTokenRateCacheDuration(address poolAddress, IERC20 token, uint256 duration) external nonReentrant {
        require(msg.sender == owner, "Sender not allowed");

        IStablePool(poolAddress).setTokenRateCacheDuration(token, duration);
    }

    function setSwapFeeAuthentication(address poolAddress, address user, bool authorized) external nonReentrant {
        require(msg.sender == owner, "Sender not allowed");
        require(_swapFeeAuthMap[poolAddress][user] != authorized, "New authorized value is same as existing");

        _swapFeeAuthMap[poolAddress][user] = authorized;
    }

    function isUserAuthorizedToManageSwapFeePercentage(address poolAddress, address user) external view returns (bool) {
        return _swapFeeAuthMap[poolAddress][user];
    }
}

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

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/vault/IProtocolFeesCollector.sol";
import "@balancer-labs/v2-interfaces/contracts/standalone-utils/IProtocolFeePercentagesProvider.sol";

import "@balancer-labs/v2-solidity-utils/contracts/helpers/SingletonAuthentication.sol";
import "@balancer-labs/v2-solidity-utils/contracts/openzeppelin/SafeCast.sol";

contract PoolSpecificProtocolFeePercentagesProvider is IProtocolFeePercentagesProvider, SingletonAuthentication {
    using SafeCast for uint256;

    IProtocolFeesCollector private immutable _protocolFeesCollector;

    struct FeeTypeData {
        uint64 value;
        uint64 maximum;
        bool registered;
        string name;
    }

    mapping(uint256 => FeeTypeData) private _feeTypeData;


    // No fee can go over 100%
    uint256 private constant _MAX_PROTOCOL_FEE_PERCENTAGE = 1e18; // 100%

    // These are copied from ProtocolFeesCollector
    uint256 private constant _MAX_PROTOCOL_SWAP_FEE_PERCENTAGE = 50e16; // 50%
    uint256 private constant _MAX_PROTOCOL_FLASH_LOAN_FEE_PERCENTAGE = 1e16; // 1%

    struct PoolSpecificFee {
        uint64 value;
        bool registered;
    }

    // we allow for a maximum of 100% for pool specific protocol swap fee percentage
    uint256 private constant _MAX_POOL_SPECIFIC_PROTOCOL_SWAP_FEE_PERCENTAGE = 1e18; // 100%
    // pool address -> feeType -> fee
    mapping(address => mapping(uint256 => PoolSpecificFee)) private _poolSpecificFees;

    event PoolSpecificProtocolFeePercentageChanged(
        address indexed poolAddress,
        uint256 indexed feeType,
        uint256 percentage
    );
    event PoolSpecificProtocolFeePercentageRemoved(address indexed poolAddress, uint256 indexed feeType);

    constructor(
        IVault vault,
        uint256 maxYieldValue,
        uint256 maxAUMValue
    ) SingletonAuthentication(vault) {
        IProtocolFeesCollector protocolFeeCollector = vault.getProtocolFeesCollector();
        _protocolFeesCollector = protocolFeeCollector; // Note that this is immutable in the Vault as well

        // Initialize all starting fee types

        // Yield and AUM types are initialized with a value of 0.
        _registerFeeType(ProtocolFeeType.YIELD, "Yield", maxYieldValue, 0);
        _registerFeeType(ProtocolFeeType.AUM, "Assets Under Management", maxAUMValue, 0);

        // Swap and Flash loan types are special as their storage is actually located in the ProtocolFeesCollector. We
        // therefore simply mark them as registered, but ignore maximum and initial values. Not calling _registerFeeType
        // also means that ProtocolFeeTypeRegistered nor ProtocolFeePercentageChanged events will be emitted for these.
        _feeTypeData[ProtocolFeeType.SWAP].registered = true;
        _feeTypeData[ProtocolFeeType.SWAP].name = "Swap";

        _feeTypeData[ProtocolFeeType.FLASH_LOAN].registered = true;
        _feeTypeData[ProtocolFeeType.FLASH_LOAN].name = "Flash Loan";
    }

    modifier withValidFeeType(uint256 feeType) {
        require(isValidFeeType(feeType), "Non-existent fee type");
        _;
    }

    function registerFeeType(
        uint256 feeType,
        string memory name,
        uint256 maximumValue,
        uint256 initialValue
    ) external override authenticate {
        require(!_feeTypeData[feeType].registered, "Fee type already registered");
        _registerFeeType(feeType, name, maximumValue, initialValue);
    }

    function _registerFeeType(
        uint256 feeType,
        string memory name,
        uint256 maximumValue,
        uint256 initialValue
    ) private {
        require((maximumValue > 0) && (maximumValue <= _MAX_PROTOCOL_FEE_PERCENTAGE), "Invalid maximum fee percentage");
        require(initialValue <= maximumValue, "Invalid initial percentage");

        _feeTypeData[feeType] = FeeTypeData({
            registered: true,
            name: name,
            maximum: maximumValue.toUint64(),
            value: initialValue.toUint64()
        });

        emit ProtocolFeeTypeRegistered(feeType, name, maximumValue);
        emit ProtocolFeePercentageChanged(feeType, initialValue);
    }

    function isValidFeeType(uint256 feeType) public view override returns (bool) {
        return _feeTypeData[feeType].registered;
    }

    function isValidFeeTypePercentage(uint256 feeType, uint256 value)
        public
        view
        override
        withValidFeeType(feeType)
        returns (bool)
    {
        return value <= getFeeTypeMaximumPercentage(feeType);
    }

    function setFeeTypePercentage(uint256 feeType, uint256 newValue)
        external
        override
        withValidFeeType(feeType)
        authenticate
    {
        require(isValidFeeTypePercentage(feeType, newValue), "Invalid fee percentage");

        if (feeType == ProtocolFeeType.SWAP) {
            _protocolFeesCollector.setSwapFeePercentage(newValue);
        } else if (feeType == ProtocolFeeType.FLASH_LOAN) {
            _protocolFeesCollector.setFlashLoanFeePercentage(newValue);
        } else {
            _feeTypeData[feeType].value = newValue.toUint64();
        }

        emit ProtocolFeePercentageChanged(feeType, newValue);
    }

    function getFeeTypePercentage(uint256 feeType) public view override withValidFeeType(feeType) returns (uint256) {
        // when the pool is requesting the fee type percentage, the msg.sender will always
        // be the address of the pool itself. We take advantage of that here.
        if (_poolSpecificFees[msg.sender][feeType].registered) {
            return _poolSpecificFees[msg.sender][feeType].value;
        }else if (feeType == ProtocolFeeType.SWAP) {
            return _protocolFeesCollector.getSwapFeePercentage();
        } else if (feeType == ProtocolFeeType.FLASH_LOAN) {
            return _protocolFeesCollector.getFlashLoanFeePercentage();
        } else {
            return _feeTypeData[feeType].value;
        }
    }

    function getFeeTypeMaximumPercentage(uint256 feeType)
        public
        view
        override
        withValidFeeType(feeType)
        returns (uint256)
    {
        if (feeType == ProtocolFeeType.SWAP) {
            return _MAX_PROTOCOL_SWAP_FEE_PERCENTAGE;
        } else if (feeType == ProtocolFeeType.FLASH_LOAN) {
            return _MAX_PROTOCOL_FLASH_LOAN_FEE_PERCENTAGE;
        } else {
            return _feeTypeData[feeType].maximum;
        }
    }

    function getFeeTypeName(uint256 feeType) external view override withValidFeeType(feeType) returns (string memory) {
        return _feeTypeData[feeType].name;
    }

    function setFeeTypePercentageForPool(address poolAddress, uint256 feeType, uint256 newValue)
        external
        withValidFeeType(feeType)
        authenticate
    {
        if (feeType == ProtocolFeeType.SWAP) {
            // We allow the protocol swap fee for specific pools to be higher than the globally imposed maximum.
            require(newValue <= _MAX_POOL_SPECIFIC_PROTOCOL_SWAP_FEE_PERCENTAGE, "Invalid fee percentage");
        } else {
            require(isValidFeeTypePercentage(feeType, newValue), "Invalid fee percentage");
        }

        _poolSpecificFees[poolAddress][feeType] = PoolSpecificFee({
            registered: true,
            value: newValue.toUint64()
        });

        emit PoolSpecificProtocolFeePercentageChanged(poolAddress, feeType, newValue);
    }

    function removeFeeTypePercentageForPool(address poolAddress, uint256 feeType)
        external
        withValidFeeType(feeType)
        authenticate
    {
        require(isValidFeeType(feeType), "Invalid fee type");
        require(_poolSpecificFees[poolAddress][feeType].registered, "Fee type not registered for pool");
        
        _poolSpecificFees[poolAddress][feeType].registered = false;
        _poolSpecificFees[poolAddress][feeType].value = 0;

        emit PoolSpecificProtocolFeePercentageRemoved(poolAddress, feeType);
    }

    function getFeeTypePercentageForPool(address poolAddress, uint256 feeType)
        external
        view
        withValidFeeType(feeType) 
        returns (uint256)
    {
        if (_poolSpecificFees[poolAddress][feeType].registered) {
            return _poolSpecificFees[poolAddress][feeType].value;
        }else  {
            return getFeeTypePercentage(feeType);
        }
    }
}

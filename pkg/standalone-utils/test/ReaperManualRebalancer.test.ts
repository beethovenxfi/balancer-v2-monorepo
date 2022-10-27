import { ethers } from 'hardhat';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { MAX_UINT256 } from '@balancer-labs/v2-helpers/src/constants';

const VAULT_ADDRESS = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
const USDC = '0x7F5c764cBc14f9669B88837ca1490cCa17c31607';
const bbrfaUSDCPoolId = '0xba7834bb3cd2db888e6a06fb45e82b4225cd0c71000000000000000000000043'

describe('ReaperManualRebalancer', function () {
    it.skip('wraps', async () => {
        const [deployer] = await ethers.getSigners();
        const vault = await ethers.getContractAt('IVault', VAULT_ADDRESS);

        const poolTokensBefore = await vault.getPoolTokens(bbrfaUSDCPoolId);
        const rebalancer = await deploy('ReaperManualRebalancer', { args: [VAULT_ADDRESS] });

        console.log('poolTokensBefore', poolTokensBefore.balances.map((balance: any) => balance.toString()))

        const usdc = await ethers.getContractAt('IERC20', USDC);

        const approveTx = await usdc.connect(deployer).approve(rebalancer.address, MAX_UINT256);
        await approveTx.wait();

        console.log('USDC balance before', (await usdc.balanceOf(deployer.address)).toString());

        const wrapTx = await rebalancer.wrap(bbrfaUSDCPoolId, 5, 0);
        await wrapTx.wait();

        console.log('USDC balance after', (await usdc.balanceOf(deployer.address)).toString());


        const poolTokensAfter = await vault.getPoolTokens(bbrfaUSDCPoolId);
        console.log('poolTokensAfter', poolTokensAfter.balances.map((balance: any) => balance.toString()));



    });

    it.skip('unwraps', async () => {
        const [deployer] = await ethers.getSigners();
        const vault = await ethers.getContractAt('IVault', VAULT_ADDRESS);

        const poolTokensBefore = await vault.getPoolTokens(bbrfaUSDCPoolId);
        const rebalancer = await deploy('ReaperManualRebalancer', { args: [VAULT_ADDRESS] });

        console.log('poolTokensBefore', poolTokensBefore.balances.map((balance: any) => balance.toString()))

        const usdc = await ethers.getContractAt('IERC20', USDC);

        const approveTx = await usdc.connect(deployer).approve(rebalancer.address, MAX_UINT256);
        await approveTx.wait();

        console.log('USDC balance before', (await usdc.balanceOf(deployer.address)).toString());

        const wrapTx = await rebalancer.unwrap(bbrfaUSDCPoolId, 5, 0);
        await wrapTx.wait();

        console.log('USDC balance after', (await usdc.balanceOf(deployer.address)).toString());


        const poolTokensAfter = await vault.getPoolTokens(bbrfaUSDCPoolId);
        console.log('poolTokensAfter', poolTokensAfter.balances.map((balance: any) => balance.toString()))

    });
});

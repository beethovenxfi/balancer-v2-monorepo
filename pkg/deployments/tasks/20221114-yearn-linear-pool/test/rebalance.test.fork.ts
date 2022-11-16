import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { bn, fp, FP_ONE } from '@balancer-labs/v2-helpers/src/numbers';
import { describeForkTest } from '../../../src/forkTests';
import Task, { TaskMode } from '../../../src/task';
import { getForkedNetwork } from '../../../src/test';
import { getSigners, impersonate } from '../../../src/signers';
import { MAX_UINT256 } from '@balancer-labs/v2-helpers/src/constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { SwapKind } from '@balancer-labs/balancer-js';

describeForkTest('YearnLinearPoolFactory', 'optimism', 38556442, function () {
  let owner: SignerWithAddress, holder: SignerWithAddress, other: SignerWithAddress;
  let factory: Contract, vault: Contract, usdc: Contract;
  let rebalancer: Contract;

  let task: Task;

  const USDC = '0x7f5c764cbc14f9669b88837ca1490cca17c31607';
  const yvUSDC = '0x4c8b1958b09b3bde714f68864bcc3a74eaf1a23d';

  const USDC_SCALING = bn(1e12); // USDC has 6 decimals, so its scaling factor is 1e12

  const USDC_HOLDER = '0xf390830df829cf22c53c8840554b98eafc5dcbc2';

  const SWAP_FEE_PERCENTAGE = fp(0.01); // 1%

  // The targets are set using 18 decimals, even if the token has fewer (as is the case for USDC);
  const INITIAL_UPPER_TARGET = fp(1e5);

  let pool: Contract;
  let poolId: string;

  before('run task', async () => {
    task = new Task('20221114-yearn-linear-pool', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    factory = await task.deployedInstance('YearnLinearPoolFactory');
  });

  before('load signers', async () => {
    [, owner, other] = await getSigners();

    holder = await impersonate(USDC_HOLDER, fp(100));
  });

  before('setup contracts', async () => {
    vault = await new Task('20210418-vault', TaskMode.READ_ONLY, getForkedNetwork(hre)).deployedInstance('Vault');

    usdc = await task.instanceAt('IERC20', USDC);
    await usdc.connect(holder).approve(vault.address, MAX_UINT256);
  });

  it('deploys a linear pool', async () => {
    const tx = await factory.create('', '', USDC, yvUSDC, INITIAL_UPPER_TARGET, SWAP_FEE_PERCENTAGE, owner.address);
    const event = expectEvent.inReceipt(await tx.wait(), 'PoolCreated');

    pool = await task.instanceAt('YearnLinearPool', event.args.pool);
    expect(await factory.isPoolFromFactory(pool.address)).to.be.true;

    poolId = await pool.getPoolId();
    const [registeredAddress] = await vault.getPool(poolId);
    expect(registeredAddress).to.equal(pool.address);

    const { assetManager } = await vault.getPoolTokenInfo(poolId, USDC); // We could query for either USDC or waUSDC
    rebalancer = await task.instanceAt('YearnLinearPoolRebalancer', assetManager);

    await usdc.connect(holder).approve(rebalancer.address, MAX_UINT256); // To send extra main on rebalance
  });

  it('joins the pool', async () => {
    // We're going to join with enough main token to bring the Pool above its upper target, which will let us later
    // rebalance.
    const joinAmount = INITIAL_UPPER_TARGET.mul(2).div(USDC_SCALING);

    await vault
      .connect(holder)
      .swap(
        { kind: SwapKind.GivenIn, poolId, assetIn: USDC, assetOut: pool.address, amount: joinAmount, userData: '0x' },
        { sender: holder.address, recipient: holder.address, fromInternalBalance: false, toInternalBalance: false },
        0,
        MAX_UINT256
      );

    // Assert join amount - some fees will be collected as we're going over the upper target.
    const excess = joinAmount.mul(USDC_SCALING).sub(INITIAL_UPPER_TARGET);
    const joinCollectedFees = excess.mul(SWAP_FEE_PERCENTAGE).div(FP_ONE);

    const expectedBPT = joinAmount.mul(USDC_SCALING).sub(joinCollectedFees);
    expect(await pool.balanceOf(holder.address)).to.equal(expectedBPT);
  });

  it('rebalances the pool', async () => {
    const { cash } = await vault.getPoolTokenInfo(poolId, USDC);
    const scaledCash = cash.mul(USDC_SCALING);
      
    await rebalancer.connect(holder).rebalance(other.address);
  });
});

import hre from 'hardhat';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { BasePoolEncoder, SwapKind, toNormalizedWeights, WeightedPoolEncoder } from '@balancer-labs/balancer-js';
import { BigNumber, fp } from '@balancer-labs/v2-helpers/src/numbers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { randomBytes } from 'ethers/lib/utils';
import { MAX_UINT256, ONES_BYTES32, ZERO_ADDRESS, ZERO_BYTES32 } from '@balancer-labs/v2-helpers/src/constants';

import { describeForkTest, getSigner, impersonate, getForkedNetwork, Task, TaskMode } from '../../../src';

describeForkTest('PoolSpecificProtocolFeePercentagesProvider', 'mainnet', 16870763, function () {
  let admin: SignerWithAddress, owner: SignerWithAddress, whale: SignerWithAddress;
  let protocolFeePercentagesProvider: Contract;
  let vault: Contract, authorizer: Contract, feesCollector: Contract, factory: Contract;
  let uni: Contract, comp: Contract, aave: Contract;

  const COMP = '0xc00e94cb662c3520282e6f5717214004a7f26888';
  const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';
  const AAVE = '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9';
  const WSTETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';

  const tokens = [UNI, AAVE, COMP];
  const initialBalanceCOMP = fp(1);
  const initialBalanceUNI = fp(1);
  const initialBalanceAAVE = fp(1);
  const initialBalances = [initialBalanceUNI, initialBalanceAAVE, initialBalanceCOMP];

  const GOV_MULTISIG = '0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f';
  const LARGE_TOKEN_HOLDER = '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503';
  const WSTETH_TOKEN_HOLDER = '0x4b5a787ac6921cdefc57d8823ebd4d211f8e0519';

  const NAME = 'Balancer Pool Token';
  const SYMBOL = 'BPT';
  const POOL_SWAP_FEE_PERCENTAGE = fp(0.01);
  const WEIGHTS = toNormalizedWeights([fp(20), fp(30), fp(50)]);

  const COMP_WSTETH_WEIGHTED_POOL_V2 = '0x496ff26B76b8d23bbc6cF1Df1eeE4a48795490F7';

  let task: Task;
  let factoryTask: Task;

  enum FeeType {
    Swap = 0,
    FlashLoan = 1,
    Yield = 2,
    AUM = 3,
  }

  before('run task', async () => {
    task = new Task('20230327-pool-specific-protocol-fee-provider', TaskMode.TEST, getForkedNetwork(hre));
    await task.run({ force: true });
    protocolFeePercentagesProvider = await task.deployedInstance('PoolSpecificProtocolFeePercentagesProvider');

    factoryTask = new Task('20230320-weighted-pool-v4', TaskMode.TEST, getForkedNetwork(hre));
  
    const input = factoryTask.input();
    // inject the deployed pool specific provider
    const args = [input.Vault, protocolFeePercentagesProvider.address, input.FactoryVersion, input.PoolVersion];
    factory = await factoryTask.deployAndVerify('WeightedPoolFactory', args, undefined, true);
  });

  before('setup accounts', async () => {
    owner = await getSigner();
    admin = await getSigner(0);
    whale = await impersonate(LARGE_TOKEN_HOLDER);
  });

  before('setup contracts', async () => {
    const vaultTask = new Task('20210418-vault', TaskMode.READ_ONLY, getForkedNetwork(hre));
    vault = await vaultTask.deployedInstance('Vault');
    authorizer = await vaultTask.instanceAt('Authorizer', await vault.getAuthorizer());
    feesCollector = await vaultTask.instanceAt('ProtocolFeesCollector', await vault.getProtocolFeesCollector());

    comp = await task.instanceAt('IERC20', COMP);
    uni = await task.instanceAt('IERC20', UNI);
    aave = await task.instanceAt('IERC20', AAVE);
  });

  before('setup admin', async () => {
    const DEFAULT_ADMIN_ROLE = await authorizer.DEFAULT_ADMIN_ROLE();
    admin = await impersonate(await authorizer.getRoleMember(DEFAULT_ADMIN_ROLE, 0));
  });

  context('without permissions', () => {
    itRevertsSettingFee(FeeType.Yield, fp(0.0157));

    itRevertsSettingFee(FeeType.Swap, fp(0.0126));
  });

  context('with setFeeTypePercentage permission', () => {
    before('grant setFeePercentage permission to admin', async () => {
      await authorizer
        .connect(admin)
        .grantRole(await actionId(protocolFeePercentagesProvider, 'setFeeTypePercentage'), admin.address);
      await authorizer
        .connect(admin)
        .grantRole(await actionId(protocolFeePercentagesProvider, 'setFeeTypePercentageForPool'), admin.address);
      await authorizer
        .connect(admin)
        .grantRole(await actionId(protocolFeePercentagesProvider, 'removeFeeTypePercentageForPool'), admin.address);
    });

    itSetsFeeCorrectly(FeeType.Yield, fp(0.1537));

    itRevertsSettingFee(FeeType.Swap, fp(0.0857));

    context('with swapFeePercentage permission', () => {
      before('grant setSwapFeePercentage permission to fees provider', async () => {
        await authorizer
          .connect(admin)
          .grantRole(await actionId(feesCollector, 'setSwapFeePercentage'), protocolFeePercentagesProvider.address);
      });

      itSetsFeeCorrectly(FeeType.Swap, fp(0.0951));

    });

    context('pool specific', () => {
      let pool1: Contract, pool2: Contract;
      let poolId1: string, poolId2: string;
      let protocolSwapFeePercentage: BigNumber, protocolYieldFeePercentage: BigNumber;

      beforeEach('deploy pools', async () => {
        pool1 = await createPool();
        poolId1 = await pool1.getPoolId();
        await initPool(poolId1);

        pool2 = await createPool();
        poolId2 = await pool2.getPoolId();
        await initPool(poolId2);

        protocolSwapFeePercentage = await protocolFeePercentagesProvider.getFeeTypePercentage(FeeType.Swap);
        protocolYieldFeePercentage = await protocolFeePercentagesProvider.getFeeTypePercentage(FeeType.Yield);
      });

      it('sets pool specific fee percentage', async () => {
        const feeBefore = await pool1.getProtocolFeePercentageCache(FeeType.Swap);

        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Swap, fp(1));
        await pool1.updateProtocolFeePercentageCache();

        const feeAfter = await pool1.getProtocolFeePercentageCache(FeeType.Swap);

        expect(feeBefore).to.be.eq(protocolSwapFeePercentage);
        expect(feeAfter).to.be.eq(fp(1));

        await pool2.updateProtocolFeePercentageCache();
        const fee2 = await pool2.getProtocolFeePercentageCache(FeeType.Swap);

        expect(fee2).to.be.eq(protocolSwapFeePercentage);
      });

      it('changing pool specific fee does not impact other pools', async () => {
        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Swap, fp(1));
        await pool1.updateProtocolFeePercentageCache();

        await pool2.updateProtocolFeePercentageCache();
        const fee = await pool2.getProtocolFeePercentageCache(FeeType.Swap);

        expect(fee).to.be.eq(protocolSwapFeePercentage);
      });

      it('can see different fees for different pools', async () => {
        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Swap, fp(0.25));
        await pool1.updateProtocolFeePercentageCache();
        const fee1 = await pool1.getProtocolFeePercentageCache(FeeType.Swap);
        
        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool2.address, FeeType.Swap, fp(0.75));
        await pool2.updateProtocolFeePercentageCache();
        const fee2 = await pool2.getProtocolFeePercentageCache(FeeType.Swap);

        expect(fee1).to.be.eq(fp(0.25));
        expect(fee2).to.be.eq(fp(0.75));
      });

      it('can remove a pool specific fee', async () => {
        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Swap, fp(0.25));
        await pool1.updateProtocolFeePercentageCache();
        const customFee = await pool1.getProtocolFeePercentageCache(FeeType.Swap);
        
        await protocolFeePercentagesProvider.connect(admin).removeFeeTypePercentageForPool(pool1.address, FeeType.Swap);
        await pool1.updateProtocolFeePercentageCache();
        const defaultFee = await pool1.getProtocolFeePercentageCache(FeeType.Swap);
        
        expect(customFee).to.be.eq(fp(0.25));
        expect(defaultFee).to.be.eq(protocolSwapFeePercentage);
      });

      it('cannot set a fee higher than the max', async () => {
        expect(protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Swap, fp(2))).to.be.revertedWith(
          'Invalid fee percentage'
        );
      });

      it('sets pool specific yield fee percentage', async () => {
        const feeBefore = await pool1.getProtocolFeePercentageCache(FeeType.Yield);

        await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentageForPool(pool1.address, FeeType.Yield, fp(0.1));
        await pool1.updateProtocolFeePercentageCache();

        const feeAfter = await pool1.getProtocolFeePercentageCache(FeeType.Yield);

        expect(feeBefore).to.be.eq(protocolYieldFeePercentage);
        expect(feeAfter).to.be.eq(fp(0.1));

        await pool2.updateProtocolFeePercentageCache();
        const fee2 = await pool2.getProtocolFeePercentageCache(FeeType.Yield);

        expect(fee2).to.be.eq(protocolYieldFeePercentage);
      });
    })
  });

  function itSetsFeeCorrectly(feeType: FeeType, fee: BigNumber): void {
    it(`set ${FeeType[feeType]} fee`, async () => {
      await protocolFeePercentagesProvider.connect(admin).setFeeTypePercentage(feeType, fee);
      expect(await protocolFeePercentagesProvider.getFeeTypePercentage(feeType)).to.be.eq(fee);
    });
  }

  function itRevertsSettingFee(feeType: FeeType, fee: BigNumber): void {
    it(`revert setting ${FeeType[feeType]} fee`, async () => {
      expect(protocolFeePercentagesProvider.connect(admin).setFeeTypePercentage(feeType, fee)).to.be.revertedWith(
        'BAL#401'
      );
    });
  }

  async function createPool(salt = ''): Promise<Contract> {
    const receipt = await (
      await factory.create(
        NAME,
        SYMBOL,
        tokens,
        WEIGHTS,
        [ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS],
        POOL_SWAP_FEE_PERCENTAGE,
        owner.address,
        salt == '' ? randomBytes(32) : salt
      )
    ).wait();

    const event = expectEvent.inReceipt(receipt, 'PoolCreated');
    return factoryTask.instanceAt('WeightedPool', event.args.pool);
  }

  async function initPool(poolId: string) {
    await comp.connect(whale).approve(vault.address, MAX_UINT256);
    await uni.connect(whale).approve(vault.address, MAX_UINT256);
    await aave.connect(whale).approve(vault.address, MAX_UINT256);

    const userData = WeightedPoolEncoder.joinInit(initialBalances);
    await vault.connect(whale).joinPool(poolId, whale.address, owner.address, {
      assets: tokens,
      maxAmountsIn: initialBalances,
      fromInternalBalance: false,
      userData,
    });
  }
});

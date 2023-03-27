import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { Contract } from 'ethers';
import { ethers } from 'hardhat';

import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import { ANY_ADDRESS, ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { advanceBlock, setAutomineBlocks } from '@balancer-labs/v2-helpers/src/mine';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import { BigNumberish, bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { advanceTime, currentTimestamp } from '@balancer-labs/v2-helpers/src/time';
import { toChainedReference } from './helpers/chainedReferences';

describe('ReliquaryStaking', function () {
  let emissionToken: Token, poolToken: Token, otherPoolToken: Token;
  let reliquary: Contract;
  let user: SignerWithAddress, anotherUser: SignerWithAddress, admin: SignerWithAddress;
  let vault: Vault;
  let relayer: Contract, relayerLibrary: Contract;
  let totalEmissions = fp(10_000_000);
  let emissionRate = fp(2);

  before('setup signer', async () => {
    [, admin, user, anotherUser] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy Vault and Reliquary', async () => {
    vault = await Vault.create({ admin });
    emissionToken = await Token.create('EmissionToken');
    poolToken = await Token.create('BPT-1');
    otherPoolToken = await Token.create('BPT-2');

    reliquary = await deploy('MockReliquary', { args: [emissionToken.address, emissionRate] });
  });

  sharedBeforeEach('mint emission tokens to reliquary', async () => {
    await emissionToken.mint(reliquary.address, totalEmissions);
  });

  sharedBeforeEach('set up relayer', async () => {
    // Deploy Relayer
    relayerLibrary = await deploy('MockBatchRelayerLibrary', {
      args: [vault.address, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS, reliquary.address],
    });

    relayer = await deployedAt('BalancerRelayer', await relayerLibrary.getEntrypoint());

    // Authorize Relayer for all actions
    const relayerActionIds = await Promise.all(
      ['swap', 'batchSwap', 'joinPool', 'exitPool', 'setRelayerApproval', 'manageUserBalance'].map((action) =>
        actionId(vault.instance, action)
      )
    );
    const authorizer = await deployedAt('v2-vault/TimelockAuthorizer', await vault.instance.getAuthorizer());
    const wheres = relayerActionIds.map(() => ANY_ADDRESS);
    await authorizer.connect(admin).grantPermissions(relayerActionIds, relayer.address, wheres);

    // Approve relayer by sender
    await vault.instance.connect(user).setRelayerApproval(user.address, relayer.address, true);
  });

  function encodeCreateRelicAndDeposit(
    sender: Account,
    recipient: Account,
    token: Token,
    pid: number,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('reliquaryCreateRelicAndDeposit', [
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(recipient),
      TypesConverter.toAddress(token),
      pid,
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeDeposit(
    sender: Account,
    token: Token,
    relicId: number,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('reliquaryDeposit', [
      TypesConverter.toAddress(sender),
      TypesConverter.toAddress(token),
      relicId,
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeWithdrawAndHarvest(
    recipient: Account,
    relicId: number,
    amount: BigNumberish,
    outputReference?: BigNumberish
  ): string {
    return relayerLibrary.interface.encodeFunctionData('reliquaryWithdrawAndHarvest', [
      TypesConverter.toAddress(recipient),
      relicId,
      amount,
      outputReference ?? 0,
    ]);
  }

  function encodeHarvestAll(relicIds: number[], recipient: Account): string {
    return relayerLibrary.interface.encodeFunctionData('reliquaryHarvestAll', [
      relicIds,
      TypesConverter.toAddress(recipient),
    ]);
  }

  async function setChainedReferenceContents(ref: BigNumberish, value: BigNumberish): Promise<void> {
    await relayer.multicall([relayerLibrary.interface.encodeFunctionData('setChainedReferenceValue', [ref, value])]);
  }

  async function expectChainedReferenceContents(ref: BigNumberish, expectedValue: BigNumberish): Promise<void> {
    const receipt = await (
      await relayer.multicall([relayerLibrary.interface.encodeFunctionData('getChainedReferenceValue', [ref])])
    ).wait();

    expectEvent.inIndirectReceipt(receipt, relayerLibrary.interface, 'ChainedReferenceValueRead', {
      value: bn(expectedValue),
    });
  }

  describe('deposit', () => {
    it('can mint and deposit tokens into a relic', async () => {
      await reliquary.addPool(
        100,
        poolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool',
        ZERO_ADDRESS
      );

      const initialAmount = fp(100);
      const depositAmount = fp(50);
      await poolToken.mint(user.address, initialAmount);
      await poolToken.approve(vault.address, depositAmount, { from: user });
      await relayer
        .connect(user)
        .multicall([encodeCreateRelicAndDeposit(user, user, poolToken, 0, depositAmount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), depositAmount);

      let senderBptBalance = await poolToken.balanceOf(user);
      expect(senderBptBalance.toString()).to.equal(initialAmount.sub(depositAmount));

      let reliquaryBptBalance = await poolToken.balanceOf(reliquary);
      expect(reliquaryBptBalance).to.equal(depositAmount);
      expect(await reliquary.balanceOf(user.address)).to.equal(1);
      const tokenId = await reliquary.tokenOfOwnerByIndex(user.address, 0);
      expect(await reliquary.ownerOf(tokenId)).to.equal(user.address);
      const position = await reliquary.getPositionForId(tokenId);
      expect(position.amount).to.equal(depositAmount);
    });

    it('can deposit tokens into an existing relic', async () => {
      await reliquary.addPool(
        100,
        poolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool',
        ZERO_ADDRESS
      );

      const initialAmount = fp(100);
      const initialDepositAmount = fp(50);
      const additionalDepositAmount = fp(30);
      const totalDepositedAmount = initialDepositAmount.add(additionalDepositAmount);

      await poolToken.mint(user.address, initialAmount);
      await poolToken.approve(reliquary.address, initialDepositAmount, { from: user });

      await reliquary.connect(user).createRelicAndDeposit(user.address, 0, initialDepositAmount);
      const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);

      await poolToken.approve(vault.address, additionalDepositAmount, { from: user });
      // we also need to approve the relayer to deposit into the nft
      await reliquary.connect(user).approve(relayer.address, relicId);

      await relayer
        .connect(user)
        .multicall([encodeDeposit(user, poolToken, relicId, additionalDepositAmount, toChainedReference(0))]);

      await expectChainedReferenceContents(toChainedReference(0), additionalDepositAmount);

      let senderBptBalance = await poolToken.balanceOf(user);
      expect(senderBptBalance).to.equal(initialAmount.sub(initialDepositAmount).sub(additionalDepositAmount));

      let reliquaryBptBalance = await poolToken.balanceOf(reliquary);
      expect(reliquaryBptBalance).to.equal(totalDepositedAmount);
      const position = await reliquary.getPositionForId(relicId);
      expect(position.amount).to.equal(totalDepositedAmount);
    });
    it('fails to mint relic and deposit tokens when the token does not match the pid', async () => {
      await reliquary.addPool(
        100,
        poolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool',
        ZERO_ADDRESS
      );

      await reliquary.addPool(
        100,
        otherPoolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool 2',
        ZERO_ADDRESS
      );

      const initialAmount = fp(100);
      const depositAmount = fp(50);
      await poolToken.mint(user.address, initialAmount);
      await poolToken.approve(vault.address, depositAmount, { from: user });
      await expect(
        relayer
          .connect(user)
          .multicall([encodeCreateRelicAndDeposit(user, user, otherPoolToken, 0, depositAmount, toChainedReference(0))])
      ).to.be.revertedWith('Incorrect token for pid');
    });

    it('fails to deposit tokens when the token does not match the pid', async () => {
      await reliquary.addPool(
        100,
        poolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool',
        ZERO_ADDRESS
      );

      await reliquary.addPool(
        100,
        otherPoolToken.address,
        ZERO_ADDRESS,
        [0, 86400, 172800, 259200],
        [100, 200, 300, 400],
        'Test Pool 2',
        ZERO_ADDRESS
      );

      const initialAmount = fp(100);
      const initialDepositAmount = fp(50);
      const additionalDepositAmount = fp(30);

      await poolToken.mint(user.address, initialAmount);
      await poolToken.approve(reliquary.address, initialDepositAmount, { from: user });

      await reliquary.connect(user).createRelicAndDeposit(user.address, 0, initialDepositAmount);
      const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);

      await poolToken.approve(vault.address, additionalDepositAmount, { from: user });
      // we also need to approve the relayer to deposit into the nft
      await reliquary.connect(user).approve(relayer.address, relicId);

      await expect(
        relayer
          .connect(user)
          .multicall([encodeDeposit(user, otherPoolToken, relicId, additionalDepositAmount, toChainedReference(0))])
      ).to.be.revertedWith('Incorrect token for pid');
    });

    describe('withdraw and harvest', () => {
      it('withraws pool tokens to recipient', async () => {
        await reliquary.addPool(
          100,
          poolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);
        const withdrawalAmountUser = fp(20);
        const withdrawalAmountOtherUser = fp(30);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);
        const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);

        // we have to approve the relayer to withdraw funds for this relic
        await reliquary.connect(user).approve(relayer.address, relicId);

        await relayer
          .connect(user)
          .multicall([encodeWithdrawAndHarvest(user, relicId, withdrawalAmountUser, toChainedReference(0))]);
        await relayer
          .connect(user)
          .multicall([encodeWithdrawAndHarvest(anotherUser, relicId, withdrawalAmountOtherUser, toChainedReference(0))]);

        expect(await poolToken.balanceOf(user.address)).to.equal(withdrawalAmountUser);
        expect(await poolToken.balanceOf(anotherUser.address)).to.equal(withdrawalAmountOtherUser);
        const position = await reliquary.getPositionForId(relicId);
        expect(position.amount).to.equal(depositAmount.sub(withdrawalAmountUser).sub(withdrawalAmountOtherUser));
        expect(await poolToken.balanceOf(relayer.address)).to.equal(0);
      });
      it('withraws reward emissions to recipient', async () => {
        await reliquary.addPool(
          100,
          poolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);
        const withdrawalAmountUser = fp(20);
        const withdrawalAmountOtherUser = fp(30);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);

        const depositTimestamp = await currentTimestamp();

        const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);

        // we have to approve the relayer to withdraw funds for this relic
        await reliquary.connect(user).approve(relayer.address, relicId);

        // now we advance some time to generate rewards, since there is only 1 pool and 1 user, he should get all rewards
        await advanceTime(100);

        await relayer
          .connect(user)
          .multicall([encodeWithdrawAndHarvest(user, relicId, withdrawalAmountUser, toChainedReference(0))]);

        const afterFirstHarvestTimestamp = await currentTimestamp();

        const expectedFirstRewards = emissionRate.mul(afterFirstHarvestTimestamp.sub(depositTimestamp));
        expect(await emissionToken.balanceOf(user.address)).to.equal(expectedFirstRewards);

        // now we advance again some time for another rewards round
        await advanceTime(200);

        await relayer
          .connect(user)
          .multicall([encodeWithdrawAndHarvest(anotherUser, relicId, withdrawalAmountOtherUser, toChainedReference(0))]);
        const afterSecondHarvestTimestap = await currentTimestamp();
        const expectedSecondRewards = emissionRate.mul(afterSecondHarvestTimestap.sub(afterFirstHarvestTimestamp));
        expect(await emissionToken.balanceOf(anotherUser.address)).to.equal(expectedSecondRewards);
        expect(await emissionToken.balanceOf(relayer.address)).to.equal(0);
      });

      it('withdraws additional rewards to recipient', async () => {
        const rewardToken = await Token.create('RewardToken');
        const rewarder = await deploy('MockReliquaryRewarder', {
          args: [10_000, rewardToken.address, reliquary.address],
        });
        await rewardToken.mint(rewarder, fp(10_000_000));
        await reliquary.addPool(
          100,
          poolToken.address,
          rewarder.address,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);
        const withdrawalAmountUser = fp(20);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);

        const depositTimestamp = await currentTimestamp();

        const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);

        // we have to approve the relayer to withdraw funds for this relic
        await reliquary.connect(user).approve(relayer.address, relicId);

        // now we advance some time to generate rewards, since there is only 1 pool and 1 user, he should get all rewards
        await advanceTime(100);

        await relayer
          .connect(user)
          .multicall([encodeWithdrawAndHarvest(user, relicId, withdrawalAmountUser, toChainedReference(0))]);

        const afterFirstHarvestTimestamp = await currentTimestamp();

        /*  
         since we give a multiplier of 10_000 and the basis points are also 10_000 
         we end up with emissionRewards * 10_000 / 10_000 = emissionRewards. So we should have 
         the same amount of reward token rewards as emission token rewards
       */
        const expectedRewards = emissionRate.mul(afterFirstHarvestTimestamp.sub(depositTimestamp));
        expect(await emissionToken.balanceOf(user.address)).to.equal(expectedRewards);
        expect(await rewardToken.balanceOf(user.address)).to.equal(expectedRewards);
        expect(await rewardToken.balanceOf(relayer.address)).to.equal(0);
      });

      it('reverts withdraw if relic is not owned by user', async () => {
        await reliquary.addPool(
          100,
          poolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);
        const withdrawalAmount = fp(20);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);
        const relicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);
        await expect(
          relayer
            .connect(anotherUser)
            .multicall([encodeWithdrawAndHarvest(anotherUser, relicId, withdrawalAmount, toChainedReference(0))])
        ).to.be.revertedWith('Sender not owner of relic');
      });

      it('reverts harvest when a relic is not owned by the user', async () => {
        await reliquary.addPool(
          100,
          poolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await poolToken.mint(anotherUser.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: anotherUser });

        /*
           we deposit into both pools with both users 
           with the same amount, so both should get half of the rewards
        */
        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);
        await reliquary.connect(anotherUser).createRelicAndDeposit(anotherUser.address, 0, depositAmount);

        const userRelicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);
        const anotherUserRelicId = await reliquary.tokenOfOwnerByIndex(anotherUser.address, 0);

        await expect(
          relayer.connect(anotherUser).multicall([encodeHarvestAll([userRelicId, anotherUserRelicId], anotherUser)])
        ).to.be.revertedWith('Sender not owner of relic');
      });
      it('harvests rewards from all relics from a given user', async () => {
        const otherPoolToken = await Token.create('Other');

        await reliquary.addPool(
          100,
          poolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Test Pool',
          ZERO_ADDRESS
        );
        await reliquary.addPool(
          100,
          otherPoolToken.address,
          ZERO_ADDRESS,
          [0, 86400, 172800, 259200],
          [100, 200, 300, 400],
          'Another Test Pool',
          ZERO_ADDRESS
        );

        const initialAmount = fp(100);
        const depositAmount = fp(100);

        await poolToken.mint(user.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: user });

        await otherPoolToken.mint(user.address, initialAmount);
        await otherPoolToken.approve(reliquary.address, depositAmount, { from: user });

        await poolToken.mint(anotherUser.address, initialAmount);
        await poolToken.approve(reliquary.address, depositAmount, { from: anotherUser });

        await otherPoolToken.mint(anotherUser.address, initialAmount);
        await otherPoolToken.approve(reliquary.address, depositAmount, { from: anotherUser });

        /*
           we deposit into both pools with both users 
           with the same amount, so both should get half of the rewards
        */
        await setAutomineBlocks(false);
        await reliquary.connect(user).createRelicAndDeposit(user.address, 0, depositAmount);
        await reliquary.connect(user).createRelicAndDeposit(user.address, 1, depositAmount);

        await reliquary.connect(anotherUser).createRelicAndDeposit(anotherUser.address, 0, depositAmount);
        await reliquary.connect(anotherUser).createRelicAndDeposit(anotherUser.address, 1, depositAmount);
        await advanceBlock();
        await setAutomineBlocks(true);

        const depositTimestamp = await currentTimestamp();

        const userRelicId = await reliquary.tokenOfOwnerByIndex(user.address, 0);
        const userOtherRelicId = await reliquary.tokenOfOwnerByIndex(user.address, 1);

        const anotherUserRelicId = await reliquary.tokenOfOwnerByIndex(anotherUser.address, 0);
        const anotherUserOtherRelicId = await reliquary.tokenOfOwnerByIndex(anotherUser.address, 1);

        // we have to approve the relayer to withdraw funds for this relic
        await reliquary.connect(user).approve(relayer.address, userRelicId);
        await reliquary.connect(user).approve(relayer.address, userOtherRelicId);

        await reliquary.connect(anotherUser).approve(relayer.address, anotherUserRelicId);
        await reliquary.connect(anotherUser).approve(relayer.address, anotherUserOtherRelicId);

        // now we advance some time to generate rewards, since there is only 1 pool and 1 user, he should get all rewards
        await advanceTime(100);

        await setAutomineBlocks(false);
        await relayer.connect(user).multicall([encodeHarvestAll([userRelicId, userOtherRelicId], user)]);
        await relayer
          .connect(anotherUser)
          .multicall([encodeHarvestAll([anotherUserRelicId, anotherUserOtherRelicId], anotherUser)]);
        await advanceBlock();
        await setAutomineBlocks(true);

        const afterFirstHarvestTimestamp = await currentTimestamp();

        const timePassed = afterFirstHarvestTimestamp.sub(depositTimestamp);

        /*
           since all pools have the same allocation and we joined in the same tx
           we expect the emissions * 3
        */
        const rewards = emissionRate.mul(timePassed).div(2);
        expect(await emissionToken.balanceOf(user.address)).to.equal(rewards);
        expect(await reliquary.pendingReward(userRelicId)).to.equal(0);
        expect(await reliquary.pendingReward(userOtherRelicId)).to.equal(0);
        expect(await reliquary.pendingReward(anotherUserRelicId)).to.equal(0);
        expect(await reliquary.pendingReward(anotherUserOtherRelicId)).to.equal(0);
      });
    });
  });
});

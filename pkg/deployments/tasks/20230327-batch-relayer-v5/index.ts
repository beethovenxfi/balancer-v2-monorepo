import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { BatchRelayerDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as BatchRelayerDeployment;

  console.log('input', input);

  console.log('vault', input.Vault);

  const relayerLibraryArgs = [
    input.Vault,
    // input.wstETH,
    // input.BalancerMinter,
    '0x8166994d9ebBe5829EC86Bd81258149B87faCfd3', // masterchef
    '0xa48d959AE2E88f1dAA7D5F611E01908106dE7598', //xboo
    '0xfcef8a994209d6916eb2c86cdd2afd60aa6f54b1', //fbeets
    '0x1ed6411670c709F4e163854654BD52c74E66D7eC', // reliquary
  ];
  const relayerLibrary = await task.deployAndVerify('BatchRelayerLibrary', relayerLibraryArgs, from, force);

  // The relayer library automatically also deploys the relayer itself: we must verify it
  const relayer: string = await relayerLibrary.getEntrypoint();

  console.log(relayer);

  const relayerArgs = [input.Vault, relayerLibrary.address]; // See BalancerRelayer's constructor
  await task.verify('BalancerRelayer', relayer, relayerArgs);
  await task.save({ BalancerRelayer: relayer });
};

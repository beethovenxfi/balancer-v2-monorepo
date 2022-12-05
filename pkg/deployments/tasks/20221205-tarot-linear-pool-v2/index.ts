import Task from '../../src/task';
import { TaskRunOptions } from '../../src/types';
import { TarotLinearPoolDeployment } from './input';

export default async (task: Task, { force, from }: TaskRunOptions = {}): Promise<void> => {
  const input = task.input() as TarotLinearPoolDeployment;

  const args = [input.Vault, input.ProtocolFeePercentagesProvider, input.BalancerQueries, '2', '2'];
  await task.deployAndVerify('TarotLinearPoolFactory', args, from, force);
};

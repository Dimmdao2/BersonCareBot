/** Hero «Разминка выполнена» на главной — только одна разминка в блоке и активный cooldown. */
export function shouldActivateDailyWarmupHeroCooldown(params: {
  dailyWarmupCount: number;
  cooldownActive: boolean;
}): boolean {
  return params.cooldownActive && params.dailyWarmupCount === 1;
}

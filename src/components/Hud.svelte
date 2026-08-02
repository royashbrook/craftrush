<!--
  The in-run HUD: wallet, level, progress and the golem meter.

  The game pushes a fresh snapshot every frame or so via the onHud hook, which
  main.js writes straight to nav.hud. There is nothing to poll and nothing to
  refresh: this just derives off whatever nav.hud currently holds.
-->
<script>
  import { nav } from '../lib/store.svelte.js';

  let { game, pauseGame } = $props();

  const h = $derived(nav.hud ?? {});
  const power = $derived(h.power ?? {});
  const pct = $derived(h.redstoneMax ? (h.redstone ?? 0) / h.redstoneMax : 0);
  const ready = $derived(h.golemReady ?? pct >= 1);
  const golemLabel = $derived.by(() => {
    const percent = Math.floor(pct * 100);
    if (h.autoGolem) return ready ? 'CALM · GOLEM SENDING' : `CALM · AUTO AT 100% · ${percent}%`;
    return ready ? 'GOLEM READY · TAP' : `GOLEM ${percent}%`;
  });

  const chips = $derived.by(() => {
    const c = [];
    if (h.mode === 'shooter') c.push(h.autoFire ? 'CALM · AUTO FIRE' : (h.firing ? 'FIRING' : 'HOLD TO FIRE'));
    if (h.mode === 'gates' && h.bossActive) c.push(h.autoCharge ? 'CALM · AUTO CHARGE' : (h.charging ? 'CHARGING' : 'HOLD TO CHARGE'));
    if (power.triple > 0) c.push(`3× ${Math.ceil(power.triple)}s`);
    if (power.rapid > 0) c.push(`RAPID ${Math.ceil(power.rapid)}s`);
    if (power.power > 0) c.push(`POWER ${Math.ceil(power.power)}s`);
    if (power.sword > 0) c.push(`SWORD ${Math.ceil(power.sword)}s`);
    if (power.axe > 0) c.push(`AXE ${Math.ceil(power.axe)}s`);
    return c.join('  ');
  });
  const bossHint = $derived.by(() => {
    const b = h.boss ?? {};
    const armorLeft = Math.max(0, (b.phases ?? 1) - (b.phase ?? 1));
    const armor = b.shielded
      ? 'ARMOR BROKEN!'
      : (armorLeft > 0 ? `ARMOR ${armorLeft}/${b.phases - 1}` : '');
    const crowd = b.needRunners ? `NEED ~${b.needRunners} RUNNERS!` : '';
    return [armor, crowd].filter(Boolean).join(' · ');
  });

  function pause() {
    pauseGame(true);
  }
</script>

<div id="hud">
  <div id="hudTop">
    <span class="chip green"><span class="em"></span> <span id="hudEmeralds">{h.emeralds ?? 0}</span></span>
    <button id="btnPause" class="chip" onclick={pause}>⏸</button>
    <span class="chip" id="hudLevel">LV {h.level ?? 1} · {h.biome ?? ''}</span>
  </div>
  <div id="progressWrap"><div id="hudProgress" style="width:{((h.progress ?? 0) * 100).toFixed(1)}%"></div></div>
  <div id="powerChips">{chips}</div>
  <div id="golemMeter" class:ready>
    <div id="golemFill" style="width:{(pct * 100).toFixed(0)}%"></div>
    <span id="golemLabel">{golemLabel}</span>
  </div>
  {#if h.objectiveText}
    <div id="runObjective" class:done={h.objectiveDone}>
      QUEST: {h.objectiveText} <b>{h.objectiveDone ? 'DONE!' : h.objectiveProgress}</b>
    </div>
  {/if}
</div>

<div id="bossBar" class:hidden={!h.bossActive}>
  <div id="bossName">{h.boss?.name ?? 'BOSS'}</div>
  <div id="bossTrack"><div id="bossFill" style="width:{h.boss?.max ? (h.boss.hp / h.boss.max * 100).toFixed(1) : 0}%"></div></div>
  <div id="bossHint">{bossHint}</div>
</div>

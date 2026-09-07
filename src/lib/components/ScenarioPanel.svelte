<script lang="ts">
	import { classifyMetric } from '$lib/metric-zones';
	import {
		formatAverage,
		formatScenarioRange,
		SCENARIO_METRIC_COLUMNS,
		scenarioHasSamples
	} from '$lib/scenarios';
	import type { Scenario } from '$lib/types';

	type Props = {
		draftName: string;
		draftScenario: Scenario | null;
		scenarios: Scenario[];
		activeId: string | null;
		saving?: boolean;
		ondraftnamechange?: (name: string) => void;
		onsave?: () => void;
		onclear?: () => void;
		onselect?: (scenario: Scenario) => void;
		ondelete?: (id: string) => void;
	};

	let {
		draftName,
		draftScenario,
		scenarios,
		activeId,
		saving = false,
		ondraftnamechange,
		onsave,
		onclear,
		onselect,
		ondelete
	}: Props = $props();

	const activeScenario = $derived(
		scenarios.find((scenario) => scenario.id === activeId) ??
			(draftScenario && !activeId ? draftScenario : null)
	);
	const canSave = $derived(Boolean(draftScenario && scenarioHasSamples(draftScenario) && !saving));

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (canSave) onsave?.();
	}
</script>

<section class="section scenario-section">
	<div class="section-heading">
		<div>
			<p class="eyebrow">Analysis</p>
			<h2>Saved scenarios</h2>
		</div>
		<span class="count">{scenarios.length}</span>
	</div>

	{#if draftScenario}
		<form class="draft-card" onsubmit={submit}>
			<div class="draft-top">
				<div>
					<p class="eyebrow">Selected range</p>
					<strong>{formatScenarioRange(draftScenario.from, draftScenario.to)}</strong>
				</div>
				<div class="draft-actions">
					<label>
						<span class="sr-only">Scenario name</span>
						<input
							value={draftName}
							oninput={(event) =>
								ondraftnamechange?.((event.currentTarget as HTMLInputElement).value)}
							placeholder="Name this window"
							maxlength="80"
							aria-label="Scenario name"
						/>
					</label>
					<button class="save" type="submit" disabled={!canSave}>
						{saving ? 'Saving…' : 'Save scenario'}
					</button>
					<button class="ghost" type="button" onclick={() => onclear?.()}>Clear</button>
				</div>
			</div>
			<p class="draft-note">
				Averages each metric for every device in this window. Saved snapshots stay available after
				the raw samples age out.
			</p>
			{#if !scenarioHasSamples(draftScenario)}
				<p class="draft-empty">No online samples in this range. Drag a wider span on the chart.</p>
			{/if}
		</form>
	{:else}
		<p class="hint">
			Drag across the history chart to mark a time window, then save it as a scenario for later
			comparison.
		</p>
	{/if}

	{#if scenarios.length > 0}
		<div class="scenario-list">
			{#each scenarios as scenario (scenario.id)}
				<div class="scenario-row" class:active={scenario.id === activeId}>
					<button class="pick" type="button" onclick={() => onselect?.(scenario)}>
						<strong>{scenario.name}</strong>
						<span>{formatScenarioRange(scenario.from, scenario.to)}</span>
					</button>
					<button
						class="ghost"
						type="button"
						onclick={() => ondelete?.(scenario.id)}
						aria-label={`Delete ${scenario.name}`}
					>
						Delete
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if activeScenario && scenarioHasSamples(activeScenario)}
		<div class="table-wrap">
			<table>
				<caption>
					Average metrics
					{#if activeId}
						for {activeScenario.name}
					{:else}
						in the selected range
					{/if}
				</caption>
				<thead>
					<tr>
						<th>Device</th>
						<th>Samples</th>
						{#each SCENARIO_METRIC_COLUMNS as column (column.key)}
							<th>{column.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each activeScenario.beacons as beacon (beacon.mac)}
						<tr>
							<th scope="row">{beacon.name}</th>
							<td>
								{beacon.averages.onlineCount}
								{#if beacon.averages.sampleCount !== beacon.averages.onlineCount}
									<span class="muted">/{beacon.averages.sampleCount}</span>
								{/if}
							</td>
							{#each SCENARIO_METRIC_COLUMNS as column (column.key)}
								<td
									class={column.key === 'signalDbm' && beacon.averages.signalDbm !== null
										? classifyMetric('signalDbm', beacon.averages.signalDbm)
										: ''}
								>
									{formatAverage(column.key, beacon.averages[column.key])}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1.2rem;
	}

	.eyebrow {
		color: var(--accent);
		font-size: 0.68rem;
		font-weight: 750;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		margin: 0 0 0.35rem;
	}

	h2 {
		font-size: 1.35rem;
		letter-spacing: -0.035em;
		margin: 0;
	}

	.count {
		color: var(--muted);
		border: 1px solid #293a47;
		border-radius: 999px;
		padding: 0.22rem 0.45rem;
		font-size: 0.58rem;
	}

	.hint,
	.draft-note,
	.draft-empty {
		color: var(--muted);
		font-size: 0.72rem;
		line-height: 1.5;
		margin: 0 0 1rem;
	}

	.draft-empty {
		color: #ebc989;
		margin-bottom: 0;
	}

	.draft-card {
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 13px;
		padding: 1rem 1.1rem;
		margin-bottom: 1rem;
	}

	.draft-top {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.draft-top strong {
		display: block;
		font-size: 0.92rem;
		letter-spacing: -0.02em;
	}

	.draft-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem;
	}

	.draft-actions input {
		width: min(260px, 70vw);
		border: 1px solid #253642;
		border-radius: 8px;
		padding: 0.48rem 0.65rem;
		background: #09131a;
		color: var(--text);
		font-size: 0.72rem;
	}

	.draft-note {
		margin: 0.75rem 0 0;
	}

	.save,
	.ghost,
	.pick {
		font: inherit;
		cursor: pointer;
	}

	.save {
		border: 1px solid #2d433f;
		border-radius: 6px;
		padding: 0.42rem 0.7rem;
		color: #06140f;
		background: var(--accent);
		font-size: 0.62rem;
		font-weight: 700;
	}

	.save:disabled {
		cursor: not-allowed;
		opacity: 0.7;
	}

	.ghost {
		border: 1px solid #2b3d49;
		border-radius: 6px;
		padding: 0.42rem 0.65rem;
		color: var(--muted);
		background: transparent;
		font-size: 0.62rem;
		font-weight: 700;
	}

	.ghost:hover {
		color: var(--text);
	}

	.scenario-list {
		border: 1px solid var(--border);
		border-radius: 13px;
		overflow: hidden;
		background: var(--surface);
		margin-bottom: 1rem;
	}

	.scenario-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.15rem 0.7rem 0.15rem 0.15rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.045);
	}

	.scenario-row:last-child {
		border-bottom: 0;
	}

	.scenario-row.active {
		background: rgba(36, 214, 167, 0.06);
	}

	.pick {
		display: block;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		color: inherit;
		padding: 0.7rem 0.75rem;
	}

	.pick strong,
	.pick span {
		display: block;
	}

	.pick strong {
		font-size: 0.78rem;
	}

	.pick span {
		color: #6f8292;
		font-size: 0.62rem;
		margin-top: 0.28rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: 13px;
		background: var(--surface);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.68rem;
	}

	caption {
		caption-side: top;
		text-align: left;
		padding: 0.8rem 0.9rem 0.45rem;
		color: #7d8e9d;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	th,
	td {
		padding: 0.55rem 0.75rem;
		text-align: left;
		white-space: nowrap;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	thead th {
		color: #687988;
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border-top: 0;
	}

	tbody th {
		font-weight: 600;
	}

	.muted {
		color: #627484;
	}

	.excellent {
		color: #2dd4bf;
	}

	.ideal {
		color: var(--accent);
	}

	.ok {
		color: var(--warning);
	}

	.bad {
		color: #f08c5a;
	}

	.terrible {
		color: var(--danger);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 760px) {
		.draft-top {
			align-items: stretch;
			flex-direction: column;
		}

		.draft-actions input {
			width: 100%;
		}
	}
</style>

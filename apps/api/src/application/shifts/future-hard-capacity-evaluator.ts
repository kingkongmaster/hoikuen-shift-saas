export type FutureHardSlot = {
  id: string;
  date: string;
  required: number;
  candidateIds: string[];
};

export type FutureCandidateCapacity = {
  staffId: string;
  remainingDays: number;
};

export type FutureHardCapacityInput = {
  candidateId: string;
  currentCandidateCount: number;
  slots: FutureHardSlot[];
  capacities: FutureCandidateCapacity[];
  candidateUnavailableSlotIdsAfterCurrent?: string[];
};

export type FutureHardCapacityResult = {
  penalty: number;
  required: number;
  beforeMatched: number;
  afterMatched: number;
};

export type FutureHardReservation = { staffId: string; slotId: string; date: string };

export function futureHardReservationPlan(slots: FutureHardSlot[], capacities: FutureCandidateCapacity[]) {
  const required = slots.reduce((sum, slot) => sum + Math.max(0, slot.required), 0);
  const coverage = maximumCoverage(slots, capacities);
  return { required, matched: coverage.matched, reservations: coverage.reservations };
}

/**
 * Returns the marginal loss of future HARD coverage caused by using one weekly
 * day of the candidate now. It is pure and bounded to the supplied horizon.
 *
 * A staff/date intermediate node enforces at most one assignment per person
 * per day, while staff capacity enforces the remaining weekly-day limit.
 */
export function futureHardCapacityLoss(input: FutureHardCapacityInput): FutureHardCapacityResult {
  const required = input.slots.reduce((sum, slot) => sum + Math.max(0, slot.required), 0);
  if (!required || input.currentCandidateCount <= 1) return { penalty: 0, required, beforeMatched: required, afterMatched: required };

  const before = maximumCoverage(input.slots, input.capacities);
  const afterCapacities = input.capacities.map((capacity) => capacity.staffId === input.candidateId
    ? { ...capacity, remainingDays: Math.max(0, capacity.remainingDays - 1) }
    : capacity);
  const unavailable = new Set(input.candidateUnavailableSlotIdsAfterCurrent ?? []);
  const afterSlots = unavailable.size ? input.slots.map((slot) => unavailable.has(slot.id)
    ? { ...slot, candidateIds: slot.candidateIds.filter((staffId) => staffId !== input.candidateId) }
    : slot) : input.slots;
  const after = maximumCoverage(afterSlots, afterCapacities);
  const coverageLoss = Math.max(0, before.matched - after.matched);
  const beforeSelected = before.reservations.some((item) => item.staffId === input.candidateId);
  const afterSelected = after.reservations.some((item) => item.staffId === input.candidateId);
  const dynamicReservationLoss = coverageLoss === 0 && beforeSelected && !afterSelected ? 1 : 0;
  return { penalty: Math.max(coverageLoss, dynamicReservationLoss), required, beforeMatched: before.matched, afterMatched: after.matched };
}

function maximumCoverage(slots: FutureHardSlot[], capacities: FutureCandidateCapacity[]) {
  const positiveSlots = slots.filter((slot) => slot.required > 0);
  if (!positiveSlots.length) return { matched: 0, reservations: [] as FutureHardReservation[] };

  const capacityByStaff = new Map(capacities.map((item) => [item.staffId, Math.max(0, item.remainingDays)]));
  const candidateIds = [...new Set(positiveSlots.flatMap((slot) => slot.candidateIds))]
    .filter((staffId) => (capacityByStaff.get(staffId) ?? 0) > 0);
  const datesByStaff = new Map<string, Set<string>>();
  for (const slot of positiveSlots) {
    for (const staffId of slot.candidateIds) {
      if (!candidateIds.includes(staffId)) continue;
      const dates = datesByStaff.get(staffId) ?? new Set<string>();
      dates.add(slot.date);
      datesByStaff.set(staffId, dates);
    }
  }

  const source = 0;
  let nextNode = 1;
  const staffNode = new Map(candidateIds.map((staffId) => [staffId, nextNode++]));
  const staffDateNode = new Map<string, number>();
  for (const staffId of candidateIds) {
    for (const date of datesByStaff.get(staffId) ?? []) staffDateNode.set(`${staffId}:${date}`, nextNode++);
  }
  const slotNode = new Map(positiveSlots.map((slot) => [slot.id, nextNode++]));
  const sink = nextNode++;
  const graph: Edge[][] = Array.from({ length: nextNode }, () => []);
  const addEdge = (from: number, to: number, capacity: number, selectedStaffId?: string) => {
    const forward: Edge = { to, reverse: graph[to].length, capacity, selectedStaffId };
    const reverse: Edge = { to: from, reverse: graph[from].length, capacity: 0 };
    graph[from].push(forward); graph[to].push(reverse);
  };

  for (const staffId of candidateIds) {
    addEdge(source, staffNode.get(staffId)!, capacityByStaff.get(staffId)!);
    for (const date of datesByStaff.get(staffId) ?? []) {
      const dateNode = staffDateNode.get(`${staffId}:${date}`)!;
      addEdge(staffNode.get(staffId)!, dateNode, 1);
      for (const slot of positiveSlots.filter((item) => item.date === date && item.candidateIds.includes(staffId))) {
        addEdge(dateNode, slotNode.get(slot.id)!, 1, staffId);
      }
    }
  }
  for (const slot of positiveSlots) addEdge(slotNode.get(slot.id)!, sink, slot.required);

  let flow = 0;
  while (true) {
    const parent: Array<{ node: number; edge: number } | null> = Array(nextNode).fill(null);
    const queue = [source]; parent[source] = { node: -1, edge: -1 };
    for (let index = 0; index < queue.length && !parent[sink]; index += 1) {
      const node = queue[index];
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0 || parent[edge.to]) continue;
        parent[edge.to] = { node, edge: edgeIndex }; queue.push(edge.to);
        if (edge.to === sink) break;
      }
    }
    if (!parent[sink]) break;
    for (let node = sink; node !== source;) {
      const step = parent[node]!;
      const edge = graph[step.node][step.edge];
      edge.capacity -= 1; graph[node][edge.reverse].capacity += 1; node = step.node;
    }
    flow += 1;
  }
  const reservations = scarceReservations(positiveSlots, capacities, flow);
  return { matched: flow, reservations };
}

type Edge = { to: number; reverse: number; capacity: number; selectedStaffId?: string };

function scarceReservations(slots: FutureHardSlot[], capacities: FutureCandidateCapacity[], target: number) {
  const remaining = new Map(capacities.map((item) => [item.staffId, Math.max(0, item.remainingDays)]));
  const usedDates = new Set<string>();
  const optionCount = new Map<string, number>();
  for (const slot of slots) for (const staffId of new Set(slot.candidateIds)) optionCount.set(staffId, (optionCount.get(staffId) ?? 0) + 1);
  const reservations: FutureHardReservation[] = [];
  let count = 0;
  for (const slot of [...slots].sort((a, b) => a.candidateIds.length - b.candidateIds.length || a.id.localeCompare(b.id))) {
    for (let unit = 0; unit < slot.required && count < target; unit += 1) {
      const candidate = [...new Set(slot.candidateIds)].filter((staffId) => (remaining.get(staffId) ?? 0) > 0 && !usedDates.has(`${staffId}:${slot.date}`))
        .sort((a, b) => (optionCount.get(a) ?? 0) - (optionCount.get(b) ?? 0) || (remaining.get(a) ?? 0) - (remaining.get(b) ?? 0) || a.localeCompare(b))[0];
      if (!candidate) continue;
      reservations.push({ staffId: candidate, slotId: slot.id, date: slot.date }); usedDates.add(`${candidate}:${slot.date}`);
      remaining.set(candidate, (remaining.get(candidate) ?? 0) - 1); count += 1;
    }
  }
  return reservations;
}

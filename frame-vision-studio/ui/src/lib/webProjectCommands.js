// Browser edits use the same serialized Project consumed by the Rust engine.
// Reopening through WASM checks the Rust serialization schema before replacing it.
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
export function webProjectCommand(wasm, command, args = {}) {
  const frameCommands = new Set(['update_grid_sizes', 'update_cell_hardware',
    'update_cell_glazing', 'update_frame_colors', 'add_frame_extension', 'remove_frame_extension']);
  const projectCommands = new Set(['get_pricing_config', 'update_pricing_config', 'get_bcf_topics',
    'create_bcf_topic', 'update_bcf_topic_status', 'add_bcf_comment', 'get_combinations',
    'create_combination', 'add_to_combination', 'add_coupling', 'remove_combination']);
  if (!frameCommands.has(command) && !projectCommands.has(command)) return undefined;
  const project = parse(wasm.get_project());
  const commit = value => { wasm.open_project_json(JSON.stringify(project)); return { value }; };
  if (command === 'get_bcf_topics') return { value: project.bcfTopics ?? [] };
  if (command === 'get_combinations') return { value: project.combinations ?? [] };
  if (['create_bcf_topic', 'update_bcf_topic_status', 'add_bcf_comment'].includes(command)) {
    const now = new Date().toISOString();
    const topics = project.bcfTopics ??= [];
    if (command === 'create_bcf_topic') {
      const topic = { guid: crypto.randomUUID(), title: args.title, description: args.description ?? '',
        status: 'Open', priority: 'Normal', creationDate: now, modifiedDate: now,
        assignedTo: null, relatedKozijnIds: [], comments: [] };
      topics.push(topic); return commit(topic);
    }
    const topic = topics.find(value => value.guid === args.guid);
    if (!topic) throw new Error('BCF topic not found.');
    topic.modifiedDate = now;
    if (command === 'update_bcf_topic_status') topic.status = args.status;
    else topic.comments.push({ guid: crypto.randomUUID(), author: args.author, date: now, comment: args.comment });
    return commit(topic);
  }
  if (['create_combination', 'add_to_combination', 'add_coupling', 'remove_combination'].includes(command)) {
    const combinations = project.combinations ??= [];
    if (command === 'create_combination') {
      const combination = { id: crypto.randomUUID(), name: args.name, mark: args.mark, members: [], couplings: [] };
      combinations.push(combination); return commit(combination);
    }
    const combination = combinations.find(value => value.id === args.combinationId);
    if (!combination) throw new Error('Combination not found.');
    if (command === 'remove_combination') {
      project.combinations = combinations.filter(value => value !== combination); return commit(null);
    }
    if (command === 'add_to_combination') {
      if (!project.kozijnen.some(value => value.id === args.kozijnId)) throw new Error('Frame not found.');
      if (![args.offsetX, args.offsetY].every(Number.isFinite)) throw new Error('Offsets must be finite numbers.');
      if (combination.members.some(value => value.kozijnId === args.kozijnId)) throw new Error('Frame is already in this combination.');
      combination.members.push({ kozijnId: args.kozijnId, offsetX: args.offsetX, offsetY: args.offsetY });
    } else {
      if (![args.memberAId, args.memberBId].every(id => combination.members.some(value => value.kozijnId === id))) throw new Error('Both frames must belong to this combination.');
      if (!Number.isFinite(args.couplingWidth) || args.couplingWidth < 0) throw new Error('Coupling width must be a nonnegative number.');
      combination.couplings.push({ memberAId: args.memberAId, memberBId: args.memberBId, couplingType: args.couplingType, couplingWidth: args.couplingWidth });
    }
    return commit(combination);
  }
  if (command === 'get_pricing_config') return { value: project.pricingConfig ?? null };
  if (command === 'update_pricing_config') {
    const config = JSON.parse(args.configJson);
    if (!config || !['discountPercentage', 'btwPercentage', 'transportCost', 'montageCostPerHour', 'montageHours']
      .every(key => Number.isFinite(config[key]) && config[key] >= 0) ||
      config.discountPercentage > 100 || config.btwPercentage > 100 || typeof config.btwVerlegd !== 'boolean') {
      throw new Error('Set finite non-negative pricing values, with discount and tax between 0 and 100 percent.');
    }
    project.pricingConfig = config;
    wasm.open_project_json(JSON.stringify(project));
    return { value: null };
  }
  const frame = project.kozijnen.find(value => value.id === args.id);
  if (!frame) throw new Error('Frame not found.');
  switch (command) {
    case 'update_grid_sizes':
      for (const [key, sizes] of [['columns', args.columnSizes], ['rows', args.rowSizes]]) {
        if (!Array.isArray(sizes) || sizes.some(size => !Number.isFinite(size))) throw new Error('Grid sizes must be finite numbers.');
        frame.grid[key].forEach((entry, i) => { if (sizes[i] !== undefined) entry.size = Math.max(100, sizes[i]); });
      }
      break;
    case 'update_cell_hardware':
    case 'update_cell_glazing': {
      const cell = frame.cells[args.cellIndex];
      if (!cell) throw new Error('Cell not found.');
      if (command === 'update_cell_glazing') cell.glazing = JSON.parse(args.glazingJson);
      else cell.hardwareSet = { ...JSON.parse(args.hardwareSetJson), autoSelected: false };
      break;
    }
    case 'update_frame_colors':
      frame.frame.colorInside = args.colorInside;
      frame.frame.colorOutside = args.colorOutside;
      break;
    case 'add_frame_extension':
      (frame.extensions ??= []).push(JSON.parse(args.extensionJson));
      break;
    case 'remove_frame_extension':
      if (!Number.isInteger(args.extensionIndex) || args.extensionIndex < 0 || args.extensionIndex >= frame.extensions.length) throw new Error('Extension not found.');
      frame.extensions.splice(args.extensionIndex, 1);
      break;
  }
  wasm.open_project_json(JSON.stringify(project));
  return { value: parse(wasm.get_kozijn(args.id)) };
}

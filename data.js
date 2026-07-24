const segmenter =
  "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function firstGrapheme(value) {
  if (!value) return "?";
  if (!segmenter) return Array.from(value)[0] ?? "?";
  return segmenter.segment(value)[Symbol.iterator]().next().value?.segment ?? "?";
}

export function makeInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = firstGrapheme(words[0]);
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1]) : "";
  return `${first}${last}`.toLocaleUpperCase();
}

function pairKey(a, b) {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function assignCommunities(people, relationships) {
  const adjacency = new Map();
  people.forEach((_, id) => adjacency.set(id, []));
  relationships.forEach((edge) => {
    adjacency.get(edge.source)?.push({ id: edge.target, weight: edge.count });
    adjacency.get(edge.target)?.push({ id: edge.source, weight: edge.count });
  });

  const labels = new Map();
  [...people.keys()].sort().forEach((id) => labels.set(id, id));

  for (let iteration = 0; iteration < 30; iteration += 1) {
    let changed = false;
    const ids = [...people.keys()].sort((a, b) => {
      const degreeA = adjacency.get(a)?.reduce((sum, item) => sum + item.weight, 0) ?? 0;
      const degreeB = adjacency.get(b)?.reduce((sum, item) => sum + item.weight, 0) ?? 0;
      return degreeB - degreeA || a.localeCompare(b);
    });

    ids.forEach((id) => {
      const scores = new Map();
      adjacency.get(id)?.forEach(({ id: neighbor, weight }) => {
        const label = labels.get(neighbor) ?? neighbor;
        scores.set(label, (scores.get(label) ?? 0) + weight);
      });
      const best = [...scores.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0];
      if (best && best !== labels.get(id)) {
        labels.set(id, best);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const uniqueLabels = [...new Set(labels.values())].sort();
  const communityIds = new Map(uniqueLabels.map((label, index) => [label, index]));
  people.forEach((person, id) => {
    person.community = communityIds.get(labels.get(id) ?? id) ?? 0;
  });
}

export function buildGraph(rawPhotos, source) {
  const photos = new Map();
  rawPhotos.forEach((photo, index) => {
    if (!photo || !Array.isArray(photo.tags)) return;
    const id = String(photo.id || `photo-${index}`);
    const existing = photos.get(id);
    const combined = [...(existing?.tags ?? []), ...photo.tags];
    const uniqueTags = new Map();
    combined.forEach((tag) => {
      const tagId = String(tag?.id ?? "").trim();
      const name = String(tag?.name ?? "").trim();
      if (tagId && name) uniqueTags.set(tagId, { id: tagId, name });
    });
    photos.set(id, {
      id,
      createdTime: photo.createdTime ?? existing?.createdTime,
      tags: [...uniqueTags.values()],
    });
  });

  const people = new Map();
  const pairCounts = new Map();

  photos.forEach((photo) => {
    const tags = [...new Map(photo.tags.map((tag) => [tag.id, tag])).values()];
    tags.forEach((tag) => {
      const current = people.get(tag.id);
      if (current) {
        current.photoCount += 1;
      } else {
        people.set(tag.id, {
          id: tag.id,
          name: tag.name,
          initials: makeInitials(tag.name),
          photoCount: 1,
          strength: 0,
          community: 0,
        });
      }
    });

    for (let i = 0; i < tags.length; i += 1) {
      for (let j = i + 1; j < tags.length; j += 1) {
        const key = pairKey(tags[i].id, tags[j].id);
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  });

  const relationships = [...pairCounts.entries()].map(
    ([key, count]) => {
      const [sourceId, targetId] = key.split("\u0000");
      const sourcePhotos = people.get(sourceId)?.photoCount ?? count;
      const targetPhotos = people.get(targetId)?.photoCount ?? count;
      const union = sourcePhotos + targetPhotos - count;
      return {
        source: sourceId,
        target: targetId,
        count,
        normalized: union > 0 ? count / union : 0,
      };
    },
  );

  relationships.forEach((edge) => {
    const sourcePerson = people.get(edge.source);
    const targetPerson = people.get(edge.target);
    if (sourcePerson) sourcePerson.strength += edge.count;
    if (targetPerson) targetPerson.strength += edge.count;
  });

  assignCommunities(people, relationships);

  return {
    version: 1,
    source,
    generatedAt: new Date().toISOString(),
    photoCount: photos.size,
    people: [...people.values()],
    relationships: relationships.sort(
      (a, b) =>
        b.count - a.count ||
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target),
    ),
  };
}

const demoNames = [
  "Avery Morgan",
  "Jordan Okafor",
  "Mina Park",
  "Noah Williams",
  "Elena García",
  "Samir Patel",
  "Camille Laurent",
  "Theo Brooks",
  "Leila Haddad",
  "Mateo Silva",
  "Priya Shah",
  "Jon Bell",
  "Fatima Noor",
  "Ren Ito",
  "Lucía Torres",
  "Owen Clarke",
  "Zara Mensah",
  "Amara Diallo",
  "Kai Nguyen",
  "Sofia Rossi",
  "Alex Kim",
  "Nia Robinson",
  "Ravi Mehta",
  "Iris Chen",
];

const demoGroups = [
  [0, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17],
  [18, 19, 20, 21, 22, 23],
];

function demoTags(indices) {
  return indices.map((index) => ({
    id: `demo-person-${index + 1}`,
    name: demoNames[index],
  }));
}

export function createDemoPhotos() {
  const photos = [];
  let id = 1;
  demoGroups.forEach((group, groupIndex) => {
    for (let round = 0; round < 8; round += 1) {
      const size = 2 + ((round + groupIndex) % 4);
      const start = (round * 2 + groupIndex) % group.length;
      const members = Array.from(
        { length: size },
        (_, offset) => group[(start + offset) % group.length],
      );
      photos.push({
        id: `demo-photo-${id++}`,
        tags: demoTags(members),
      });
    }
  });

  [
    [0, 6, 12, 18],
    [1, 7, 13],
    [2, 8, 19, 22],
    [4, 10, 16],
    [5, 11, 17, 23],
    [3, 9, 14, 20],
    [0, 2, 12, 14],
    [7, 9, 18, 21],
  ].forEach((indices) => {
    photos.push({ id: `demo-photo-${id++}`, tags: demoTags(indices) });
  });
  return photos;
}

function isGraphDocument(document) {
  return (
    document?.version === 1 &&
    Array.isArray(document.people) &&
    Array.isArray(document.relationships) &&
    typeof document.photoCount === "number"
  );
}

export function parseImport(value) {
  const document = value;
  if (isGraphDocument(document)) {
    return {
      ...document,
      source: "import",
      generatedAt: new Date().toISOString(),
      people: document.people.map((person) => ({
        ...person,
        initials: makeInitials(person.name),
      })),
    };
  }
  if (Array.isArray(document?.photos)) {
    return buildGraph(document.photos, "import");
  }
  if (Array.isArray(value)) {
    return buildGraph(value, "import");
  }
  throw new Error(
    "Unsupported file. Import a SPINE export or a JSON object containing a photos array.",
  );
}

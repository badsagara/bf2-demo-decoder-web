// BF2 Round Replay: decoders whose rounds come out the same as another's - so a new decoder needn't decode every round
// again, nor the background analysis look at every round again. (v229: out of ingest.mjs, for analyze.mjs too.)
// Decoders whose rounds come out the same as the current one's (a fix that changes only demos that failed before): rounds
// they made are not decoded again after the update, only marked as made by the current decoder. (v138 used it once:
// 054e89ecf1 = 3621404639 but for maps not among the 22. v140's decoder adds to every round: none now.)
// (v156) { from: [hashes], except: [maps] }: the same, but rounds on these maps are decoded again - a629ba2a28 numbers the
// Euro Force's and Special Forces' templates (their maps below); every other round comes out byte for byte as with
// 1d5536877e (the 9 test rounds checked), so only these are decoded again
export const EF_SF_MAPS = ['greatwall', 'taraba_quarry', 'operationsmokescreen', 'devils_perch', 'ghost_town', 'iron_gator', 'leviathan', 'mass_destruction', 'night_flight', 'surge', 'warlord'];
// (v161) a list of such rules: e9d9e7595f is a629ba2a28 made faster (the packets' bits read when asked, not worked out
// for every bit position first; a soldier's rides looked up from where the last frame left off; the map size's 99th
// percentile picked without sorting every position) - every round comes out byte for byte the same (80 rounds checked),
// so nothing is decoded again; rounds still made by 1d5536877e keep v156's rule
// (v185) 5e7024cf21 is f70674b7e0 with the Special Forces rounds' sides taken from the Player ghost when the kits put
// everyone on one side (todo 225): every other round comes out byte for byte the same (23 test rounds checked; of the
// 1667 rounds of the analysis only two had one side, both on SF maps), so only the EF / SF maps are decoded again
export const SAME_ROUNDS = { e9d9e7595f: [{ from: ['a629ba2a28'] }, { from: ['1d5536877e'], except: EF_SF_MAPS }], '5e7024cf21': [{ from: ['f70674b7e0'], except: EF_SF_MAPS }] };
// (v229) e3ddfc2d41 is ed60068be7 with the game video kit's packer in the decoder's part of the page (packDemo, run in
// its worker) and two options for it in decodeDemo (the kind of each ghost record; stop after a tick): with neither,
// every round comes out byte for byte the same (21 test rounds checked), so nothing is decoded again
SAME_ROUNDS.e3ddfc2d41 = [{ from: ['ed60068be7'] }];
// (v235) 18e8999d15 has no rule: it reads a soldier's stance right where his health came in the same record (lost or
// misread before - 0.1-0.4% of the time in the test rounds), keeps each kill's direction (todo 286 a) and packs at most
// 255 records a packet for the game video kit - every round with its demo is decoded again

// the rules for a decoder: [{ from: [hashes], except: Set of maps }]
export function sameRules(hash) {
  const S0 = SAME_ROUNDS[hash];
  return (Array.isArray(S0) ? (S0.every(x => typeof x === 'string') ? [{ from: S0 }] : S0) : S0 ? [S0] : []).map(q => ({ from: q.from || [], except: new Set(q.except || []) }));
}
// a round on map `map` decoded by `old`: does it come out the same with `hash`?
export const sameAs = (hash, old, map) => hash === old || sameRules(hash).some(q => q.from.includes(old) && !q.except.has(String(map || 'unknown').toLowerCase()));

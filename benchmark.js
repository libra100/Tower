const workers = {
    brickmaking: 4,
    bitumen: 3,
    wood: 2,
    transport: 3,
    construction: 3
};

const iterations = 10000000;

console.log(`Running ${iterations} iterations...`);

// Baseline: Object.values().reduce()
console.time('Object.values().reduce()');
for (let i = 0; i < iterations; i++) {
    const total = Object.values(workers).reduce((a, b) => a + b, 0);
}
console.timeEnd('Object.values().reduce()');

// Optimized: Manual Sum
console.time('Manual Sum');
for (let i = 0; i < iterations; i++) {
    const total = workers.brickmaking + workers.bitumen + workers.wood + workers.transport + workers.construction;
}
console.timeEnd('Manual Sum');

// Optimized: Manual Sum (using loop if keys were dynamic, but here they are fixed)
console.time('For...in loop');
for (let i = 0; i < iterations; i++) {
    let total = 0;
    for (const key in workers) {
        total += workers[key];
    }
}
console.timeEnd('For...in loop');

const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html><body><div id="map"></div></body>`);
const document = dom.window.document;
const Node = dom.window.Node;

const bottomControls = ['.mapboxgl-ctrl-bottom-left', '.mapboxgl-ctrl-bottom-right', '.leaflet-control-attribution'];

function originalLogic(mutations) {
    let count = 0;
    for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const isControl = bottomControls.some(sel => node.matches(sel) || node.querySelector(sel));
                if (isControl) {
                    count++;
                }
            }
        });
    }
    return count;
}

function optimizedLogic(mutations) {
    let count = 0;
    const combinedSel = bottomControls.join(', ');
    for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches(combinedSel)) {
                    count++;
                } else {
                    const children = node.querySelectorAll(combinedSel);
                    if (children.length > 0) {
                        count += children.length; // Actually original logic just counts the node
                    }
                }
            }
        });
    }
    return count;
}

function optimizedLogic2(mutations) {
    let count = 0;
    const combinedSel = bottomControls.join(', ');
    for (let i = 0; i < mutations.length; i++) {
        const addedNodes = mutations[i].addedNodes;
        for (let j = 0; j < addedNodes.length; j++) {
            const node = addedNodes[j];
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches(combinedSel) || node.querySelector(combinedSel)) {
                    count++;
                }
            }
        }
    }
    return count;
}

// Generate mutations
const mutations = [];
for (let i = 0; i < 1000; i++) {
    const parent = document.createElement("div");
    for (let j = 0; j < 10; j++) {
        const child = document.createElement("img"); // simulating tiles
        child.className = "leaflet-tile";
        parent.appendChild(child);
    }
    mutations.push({ addedNodes: [parent] });
}
const parentWithControl = document.createElement("div");
const control = document.createElement("div");
control.className = "mapboxgl-ctrl-bottom-left";
parentWithControl.appendChild(control);
mutations.push({ addedNodes: [parentWithControl] });

console.time("Original");
for (let i=0; i<100; i++) originalLogic(mutations);
console.timeEnd("Original");

console.time("Optimized (querySelectorAll)");
for (let i=0; i<100; i++) optimizedLogic(mutations);
console.timeEnd("Optimized (querySelectorAll)");

console.time("Optimized 2 (querySelector combined)");
for (let i=0; i<100; i++) optimizedLogic2(mutations);
console.timeEnd("Optimized 2 (querySelector combined)");

# Swat the Fly

Throw something at a real fruit fly's escape circuit and watch it dodge.

Open `index.html` in a browser. No server, no build step, no dependencies.

    start web\index.html        # Windows

## How it works

    LC4 (126) + LPLC2 (185)  ->  124 interneurons  ->  DNp01 x2  ->  escape

LC4 and LPLC2 are looming detectors. DNp01 is the Giant Fiber, the neuron
pair that launches a fly's escape jump. All 437 neurons, their 12,897
connections, the synapse counts and the excitatory/inhibitory signs come
from the FlyEM male CNS v1.0 connectome. Nothing is trained.

Each Giant Fiber is wired to one eye only -- DNp01_L gets 6,418 synapses
from left-eye detectors and none from the right -- so which one fires says
which side the threat came from.

## Files

    index.html    page
    style.css     styling -- every colour is a variable in the :root block
    circuit.js    the 437-neuron circuit, exported from ../extract_circuit.py
    tuning.js     the five simulation constants, and why they are what they are
    vision.js     angular size per eye (the invented part: stands in for the optic lobe)
    fly.js        leaky integrate-and-fire simulation of the connectome
    scene.js      the grass, drawn once into an offscreen canvas
    trace.js      rolling plot of the two Giant Fibers
    brain.js      the 437 neurons at their real soma positions, frontal view
    app.js        arena, throwing, controls, all three canvases

Only `vision.js`, `fly.js` and `tuning.js` decide what the fly does. The
rest is rendering, and the grass, soil and clover are scenery the fly is
never shown.

## Controls

    drag          send a bird -- several at once is allowed
    space         pause
    R             replay the last attack at quarter speed
    reset         clear the counts and put the fly back

## Tests

    node test_reflex.js     the reflex itself
    node drift.js           that the fly returns to its spot under a barrage

Checks direct hits escape, that the correct Giant Fiber fires for the side
the throw came from, that a wide miss produces no flinch, and that an idle
fly never fires by itself.

## Screenshots

`index.html#demo` throws one automatically. `#demo=72` also runs 72 steps
before the first frame, so a screenshot lands at a known moment.

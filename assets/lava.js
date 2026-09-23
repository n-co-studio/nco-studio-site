/* ------------------------------------------------------------------------ *
 * Lava gradient — vanilla port of the markpreston.co playground component
 * (src/app/playground/lava/LavaBackground.tsx).
 *
 * Each colour becomes one irregular, organically-morphing blob: its outline is
 * a closed spline whose points bulge and recede over time, so the shape is
 * asymmetric at rest and continuously reshapes like a lava lamp. Blobs drift,
 * merge at their edges via a gooey metaball filter, and slide out of the way
 * of the cursor so a clear void opens around a resting pointer.
 *
 * Edit LAVA_CONFIG to control the look. Nothing else needs to change.
 * ------------------------------------------------------------------------ */
(function () {
  'use strict';

  var LAVA_CONFIG = {
    background: '#000000',
    // A small variation of forest greens.
    colors: ['#0B3D22', '#14532D', '#1B5E20', '#2D6A4F', '#40916C', '#245C3A'],
    // 'darken' keeps the darker of two overlapping greens: the field deepens
    // where blobs meet rather than lightening ('screen') or crushing toward
    // black ('multiply'), so it stays a continuous green.
    blend: 'darken',
    blur: 5,
    size: 32,
    points: 8,
    irregularity: 0.34,
    morph: 0.26,
    speed: 0.06,
    drift: 13,
    pointerStrength: 9,
    blobOpacity: 0.95,
    /* Hovering [data-lava-scatter] sends every blob out to the canvas edge,
       clearing the middle of the screen. Each blob's centre lands this many
       CSS pixels in from the edge — a fresh random value per blob, per hover. */
    scatterInsetMin: 0,
    scatterInsetMax: 40,
    /* Blob radius multiplier while scattered — a slight loosening of the field
       as it opens up, not a real size change. */
    scatterScale: 0.85,
    /* Per-frame easing toward / away from the scattered layout (0–1). Lower is
       slower: ~0.011 is a long, deliberate glide of roughly 3–4 seconds. */
    scatterEase: 0.011,
  };

  // The viewBox is VB units tall and as many units wide as the viewport's
  // aspect ratio calls for, so the canvas is never cropped and the blob field
  // spreads across the full screen instead of being sliced at the edges.
  // Everything sized in viewBox units is then scaled by UNIT (1 on a square
  // viewport, larger on a wide one) so blobs grow with the screen.
  var VB = 100;
  var CENTER = VB / 2;
  // Cursor-repel gap radius in viewBox units — no blob centre is allowed nearer
  // than this to the cursor, so a void opens around a resting pointer.
  var GAP_RADIUS = 34;

  /* --- 2D simplex noise (stands in for the `simplex-noise` package) ------- */
  var F2 = 0.5 * (Math.sqrt(3) - 1);
  var G2 = (3 - Math.sqrt(3)) / 6;
  var GRAD = [1,1, -1,1, 1,-1, -1,-1, 1,0, -1,0, 1,0, -1,0, 0,1, 0,-1, 0,1, 0,-1];

  function createNoise2D() {
    var p = new Uint8Array(256), i, n, q;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) {
      n = Math.floor((i + 1) * Math.random());
      q = p[i]; p[i] = p[n]; p[n] = q;
    }
    var perm = new Uint8Array(512);
    var gx = new Float64Array(512), gy = new Float64Array(512);
    for (i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      gx[i] = GRAD[(perm[i] % 12) * 2];
      gy[i] = GRAD[(perm[i] % 12) * 2 + 1];
    }
    return function (x, y) {
      var n0 = 0, n1 = 0, n2 = 0;
      var s = (x + y) * F2;
      var i = Math.floor(x + s), j = Math.floor(y + s);
      var t = (i + j) * G2;
      var x0 = x - (i - t), y0 = y - (j - t);
      var i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      var ii = i & 255, jj = j & 255, gi, t0, t1, t2;
      t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 >= 0) { gi = ii + perm[jj]; t0 *= t0; n0 = t0 * t0 * (gx[gi] * x0 + gy[gi] * y0); }
      t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 >= 0) { gi = ii + i1 + perm[jj + j1]; t1 *= t1; n1 = t1 * t1 * (gx[gi] * x1 + gy[gi] * y1); }
      t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 >= 0) { gi = ii + 1 + perm[jj + 1]; t2 *= t2; n2 = t2 * t2 * (gx[gi] * x2 + gy[gi] * y2); }
      return 70 * (n0 + n1 + n2);
    };
  }

  /**
   * Deterministic pseudo-random in [-1, 1] from two integers — a hash, not RNG,
   * so the resting shape is identical on every load.
   */
  function hash(a, b) {
    var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  }

  /**
   * Lay the blobs out on a ring around the centre so their home regions are
   * spread apart, and give each an irregular resting outline. With drift +
   * overlap they merge at the edges without any one sitting permanently on top.
   */
  function buildBlobs(config) {
    var n = config.colors.length;
    return config.colors.map(function (color, i) {
      // Per-blob variety in size and depth, derived from the index so it stays
      // deterministic across loads.
      var variety = ((i * 7) % 5) / 5;
      // Resting outline: each control point gets its own static radius
      // multiplier so the shape is lumpy (never a circle) even before morphing.
      var shape = [];
      for (var k = 0; k < config.points; k++) {
        shape.push(1 + config.irregularity * hash(i + 1, k + 1));
      }
      return {
        color: color,
        angle: (i / n) * Math.PI * 2 - Math.PI / 2,
        sizeFactor: 0.82 + variety * 0.36,
        // homeX / homeY / radius are set by layout(), which depends on the
        // viewport aspect ratio and so is recomputed on every resize.
        homeX: 0, homeY: 0, radius: 0,
        shape: shape,
        seedX: i * 12.7,
        seedY: i * 12.7 + 100,
        seedShape: i * 31.4,
        depth: 0.5 + variety * 0.8,
      };
    });
  }

  /**
   * Size the canvas to the viewport and spread the blobs' home positions on an
   * ellipse that fills it — wider than tall on a landscape screen — scaling
   * every length by UNIT so the field grows with the screen rather than being
   * cropped by it.
   */
  function computeLayout(blobs, config, width, height) {
    var vbw = VB * Math.max(width / Math.max(height, 1), 0.4);
    // 1 on a square viewport, ~1.26 at 16:10, ~1.33 at 16:9.
    var unit = Math.sqrt(vbw * VB) / VB;
    var single = blobs.length === 1;
    // The ring is pushed out near the canvas edge (rather than the 0.3 of the
    // original square layout) so the outermost blobs bleed off the left and
    // right sides instead of leaving a black margin there. Nothing clamps a
    // blob to the canvas; edge coverage is a product of this radius, the blob
    // size and the drift range, so the three move together.
    var ringX = single ? 0 : vbw * 0.46;
    var ringY = single ? 0 : VB * 0.34;
    blobs.forEach(function (b) {
      b.homeX = vbw / 2 + Math.cos(b.angle) * ringX;
      b.homeY = CENTER + Math.sin(b.angle) * ringY;
      b.radius = config.size * b.sizeFactor * unit;
      b.scatterRadius = b.radius * config.scatterScale;
    });
    return { vbw: vbw, unit: unit };
  }

  /**
   * Roll a fresh scatter target per blob. Each blob goes to whichever edge it
   * is already nearest — so the field stays spread around the perimeter and no
   * blob makes a long diagonal trip — but to a randomly chosen position ALONG
   * that edge, re-rolled on every hover, so it never lands the same way twice.
   *
   * Only the choices are stored here (side, position along it, inset); the
   * viewBox coordinates are derived in applyEdgeTargets, so a resize moves the
   * targets without disturbing the randomness.
   */
  function rollScatterTargets(blobs, config, vbw) {
    var lo = config.scatterInsetMin, hi = config.scatterInsetMax;
    blobs.forEach(function (b) {
      var dLeft = b.homeX, dRight = vbw - b.homeX;
      var dTop = b.homeY, dBottom = VB - b.homeY;
      var nearest = Math.min(dLeft, dRight, dTop, dBottom);
      b.edgeSide = nearest === dLeft ? 'left'
        : nearest === dRight ? 'right'
        : nearest === dTop ? 'top' : 'bottom';
      b.edgeAlong = Math.random();            // 0–1 position along that edge
      b.insetPx = lo + Math.random() * (hi - lo);
    });
  }

  /**
   * Resolve each blob's stored scatter choice into viewBox coordinates. The
   * inset is held in CSS pixels and converted here, so it stays a true 0–40px
   * however the viewport is scaled.
   */
  function applyEdgeTargets(blobs, vbw, pxToVb) {
    blobs.forEach(function (b) {
      var inset = b.insetPx * pxToVb;
      if (b.edgeSide === 'left' || b.edgeSide === 'right') {
        b.edgeX = b.edgeSide === 'left' ? inset : vbw - inset;
        b.edgeY = b.edgeAlong * VB;
      } else {
        b.edgeX = b.edgeAlong * vbw;
        b.edgeY = b.edgeSide === 'top' ? inset : VB - inset;
      }
    });
  }

  /**
   * Smooth closed SVG path through the blob's control points, via a
   * Catmull-Rom → cubic-bézier conversion. `radii[k]` is point k's distance
   * from the centre; angles are evenly spaced around the circle.
   */
  function blobPath(cx, cy, radii, angles) {
    var k = radii.length, px = [], py = [], i;
    for (i = 0; i < k; i++) {
      px.push(cx + Math.cos(angles[i]) * radii[i]);
      py.push(cy + Math.sin(angles[i]) * radii[i]);
    }
    var d = 'M ' + px[0].toFixed(2) + ' ' + py[0].toFixed(2);
    for (i = 0; i < k; i++) {
      var p0x = px[(i - 1 + k) % k], p0y = py[(i - 1 + k) % k];
      var p1x = px[i], p1y = py[i];
      var p2x = px[(i + 1) % k], p2y = py[(i + 1) % k];
      var p3x = px[(i + 2) % k], p3y = py[(i + 2) % k];
      var c1x = p1x + (p2x - p0x) / 6, c1y = p1y + (p2y - p0y) / 6;
      var c2x = p2x - (p3x - p1x) / 6, c2y = p2y - (p3y - p1y) / 6;
      d += ' C ' + c1x.toFixed(2) + ' ' + c1y.toFixed(2) + ' ' +
           c2x.toFixed(2) + ' ' + c2y.toFixed(2) + ' ' +
           p2x.toFixed(2) + ' ' + p2y.toFixed(2);
    }
    return d + ' Z';
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    var node = document.createElementNS(SVGNS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  function mount(host, config) {
    var blobs = buildBlobs(config);
    var angles = [];
    for (var a = 0; a < config.points; a++) angles.push((a / config.points) * Math.PI * 2);

    var svg = el('svg', {
      // viewBox + rect are sized by layout() below; the box matches the
      // viewport's aspect exactly, so 'meet' scales uniformly with no crop.
      viewBox: '0 0 ' + VB + ' ' + VB,
      preserveAspectRatio: 'xMidYMid meet',
      'aria-hidden': 'true',
      class: 'lava',
    });

    /*
      Gooey / metaball filter: blur the blobs, then crush alpha so nearby fields
      fuse into a single lava shape, then soften the fused edge so the colours
      read as a gradient blend rather than hard cutouts.
    */
    var defs = el('defs');
    var filter = el('filter', {
      id: 'lava-goo', x: '-50%', y: '-50%', width: '200%', height: '200%',
      'color-interpolation-filters': 'sRGB',
    });
    var blur1 = el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: config.blur, result: 'blur' });
    filter.appendChild(blur1);
    filter.appendChild(el('feColorMatrix', {
      in: 'blur', type: 'matrix',
      values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8', result: 'goo',
    }));
    var blur2 = el('feGaussianBlur', { in: 'goo', stdDeviation: config.blur * 0.4 });
    filter.appendChild(blur2);
    defs.appendChild(filter);
    svg.appendChild(defs);

    var bg = el('rect', { x: 0, y: 0, width: VB, height: VB, fill: config.background });
    svg.appendChild(bg);

    var group = el('g', { filter: 'url(#lava-goo)', opacity: config.blobOpacity });
    var paths = blobs.map(function (b) {
      var path = el('path', { fill: b.color });
      path.style.mixBlendMode = config.blend;
      group.appendChild(path);
      return path;
    });
    svg.appendChild(group);
    host.appendChild(svg);

    // Current layout, refreshed whenever the viewport changes size.
    var vbw = VB, unit = 1, drift = config.drift, gapRadius = GAP_RADIUS;
    // Scatter (hover) state: `scatter` eases toward `scatterTo` (0 rest, 1 out
    // at the edges), so the blobs glide out and back rather than snapping.
    var scatter = 0, scatterTo = 0;

    function layout() {
      var out = computeLayout(blobs, config, host.clientWidth, host.clientHeight);
      vbw = out.vbw;
      unit = out.unit;
      // Blur, drift and the cursor gap are lengths too — scale them with the
      // screen so the composition reads identically at any size.
      drift = config.drift * unit;
      gapRadius = GAP_RADIUS * unit;
      // Homes have just moved, so a blob may now be nearest a different edge —
      // but only re-roll if it has never been rolled, so a resize mid-hover
      // slides the existing targets rather than reshuffling them.
      if (!blobs[0].edgeSide) rollScatterTargets(blobs, config, vbw);
      applyEdgeTargets(blobs, vbw, vbw / Math.max(host.clientWidth, 1));
      blur1.setAttribute('stdDeviation', config.blur * unit);
      blur2.setAttribute('stdDeviation', config.blur * unit * 0.4);
      svg.setAttribute('viewBox', '0 0 ' + vbw.toFixed(2) + ' ' + VB);
      bg.setAttribute('width', vbw.toFixed(2));
      // Repaint resting shapes immediately, so a resize before the first
      // animation frame (or with motion reduced) is not left blank.
      blobs.forEach(function (b, i) {
        paths[i].setAttribute('d', blobPath(
          b.homeX, b.homeY,
          b.shape.map(function (s) { return b.radius * s; }),
          angles,
        ));
      });
    }
    layout();
    window.addEventListener('resize', layout, { passive: true });

    // Static composition — resting shapes stay put.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Hovering (or keyboard-focusing) the marked link clears the centre by
    // sending the blobs out to the edges. Each entry re-rolls the insets, so
    // they never settle in quite the same place twice.
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-lava-scatter]'),
      function (trigger) {
        ['pointerenter', 'focus'].forEach(function (evt) {
          trigger.addEventListener(evt, function () {
            rollScatterTargets(blobs, config, vbw);
            applyEdgeTargets(blobs, vbw, vbw / Math.max(host.clientWidth, 1));
            scatterTo = 1;
          });
        });
        ['pointerleave', 'blur'].forEach(function (evt) {
          trigger.addEventListener(evt, function () { scatterTo = 0; });
        });
      },
    );

    // Track on ANY pointing device — a fine cursor OR a coarse pointer:
    // `pointermove` fires for touch drags too, so a finger moving across the
    // screen drives the same repel as the mouse.
    var canTrack = config.pointerStrength > 0 &&
      window.matchMedia('(pointer: fine), (pointer: coarse)').matches;

    var noiseX = createNoise2D(), noiseY = createNoise2D(), noiseR = createNoise2D();

    // Cursor state in viewBox units; current lags target for an eased,
    // "tracking" feel rather than a rigid lock. Starts off-canvas so nothing is
    // pushed before the first pointer move.
    var targetX = -9999, targetY = -9999, curX = targetX, curY = targetY, primed = false;
    var lastClientX = 0, lastClientY = 0, hasPointer = false;

    function updateTarget() {
      var rect = svg.getBoundingClientRect();
      // The viewBox matches the viewport aspect, so this is a plain
      // proportional map — the cursor lines up with what's actually painted.
      targetX = ((lastClientX - rect.left) / Math.max(rect.width, 1)) * vbw;
      targetY = ((lastClientY - rect.top) / Math.max(rect.height, 1)) * VB;
      if (!primed) { curX = targetX; curY = targetY; primed = true; }
    }

    if (canTrack) {
      window.addEventListener('pointermove', function (e) {
        lastClientX = e.clientX; lastClientY = e.clientY; hasPointer = true;
        updateTarget();
      }, { passive: true });
      window.addEventListener('resize', function () {
        if (hasPointer) updateTarget();
      }, { passive: true });
    }

    var k = config.points, radii = new Array(k), start = 0;

    function frame(now) {
      if (!start) start = now;
      var t = ((now - start) / 1000) * config.speed;
      curX += (targetX - curX) * 0.05;
      curY += (targetY - curY) * 0.05;
      scatter += (scatterTo - scatter) * config.scatterEase;
      // Ease the blend itself (smoothstep) so the departure and the return both
      // start and finish gently rather than yanking at the extremes.
      var s = scatter * scatter * (3 - 2 * scatter);

      for (var i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        // Whole-shape drift (before any cursor influence).
        var bx = b.homeX + noiseX(b.seedX + t, b.seedY) * drift;
        var by = b.homeY + noiseY(b.seedX, b.seedY + t) * drift;
        // Keep every blob at least GAP_RADIUS from the cursor: any blob nearer
        // is slid straight out along its away-vector to the gap edge, so the
        // blobs vacate a resting cursor and expose the background behind them.
        var dx = bx - curX, dy = by - curY;
        var dist = Math.hypot(dx, dy) || 0.001;
        var targetDist = Math.max(dist, gapRadius);
        var cx = curX + (dx / dist) * targetDist;
        var cy = curY + (dy / dist) * targetDist;
        // Blend toward the parked edge position while the link is hovered. At
        // s = 1 the blob sits on its edge target, so the cursor repel and the
        // drift above fade out rather than fighting it.
        if (s > 0.001) {
          cx += (b.edgeX - cx) * s;
          cy += (b.edgeY - cy) * s;
        }
        // Per-point outline morph — each lobe bulges on its own noise track, so
        // the shape churns like liquid instead of scaling uniformly.
        var r = b.radius + (b.scatterRadius - b.radius) * s;
        for (var pt = 0; pt < k; pt++) {
          radii[pt] = r * (b.shape[pt] + noiseR(b.seedShape + pt * 1.7, t + pt * 0.35) * config.morph);
        }
        paths[i].setAttribute('d', blobPath(cx, cy, radii, angles));
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  var host = document.getElementById('lava');
  if (host) mount(host, LAVA_CONFIG);
})();

// Standard Map Definitions & Geometry Queries for Đảo Đèn Lồng (Contract v1.1 / v1.2 / v1.3)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameMaps = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function round3(n) {
    const r = Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }

  function ringPoints(cx, cz, y, radius, count, startDeg = 0) {
    const pts = [];
    const step = 360 / count;
    for (let i = 0; i < count; i++) {
      const rad = ((startDeg + i * step) * Math.PI) / 180;
      pts.push([round3(cx + Math.cos(rad) * radius), y, round3(cz + Math.sin(rad) * radius)]);
    }
    return pts;
  }

  function createNight1() {
    const moteSpawns = [
      ...ringPoints(0, 0, 0, 12, 8, 0),
      ...ringPoints(0, 0, 0, 33, 16, 0)
    ];
    const shadeSpawns = ringPoints(0, 0, 0, 37, 12, 15);
    return {
      night: 1,
      name: 'Đảo Bến',
      subtitle: 'Hòn đảo khởi đầu giữa biển mây tĩnh lặng',
      elderQuote: 'Con hãy giữ lấy đom đóm, thắp sáng 5 ngọn Đèn Lồng Lớn trước khi sương đen nuốt chửng Đảo Bến.',
      startPos: [0, 0, 0],
      lanterns: [
        { id: 'L1', pos: [0, 0, 25] },
        { id: 'L2', pos: [23.8, 0, 7.7] },
        { id: 'L3', pos: [14.7, 0, -20.2] },
        { id: 'L4', pos: [-14.7, 0, -20.2] },
        { id: 'L5', pos: [-23.8, 0, 7.7] }
      ],
      moteSpawns,
      shadeSpawns,
      shadeSpawnIntervalTicks: 480, // 8s
      shadeMax: 6,
      driftersEnabled: false,
      drifterSpawns: [],
      charms: [],
      windEnabled: false,
      jumpPads: [],
      obstacles: [],
      getFloorY(x, z, currentY) {
        const r = Math.hypot(x, z);
        if (r <= 40.0) return 0;
        return null;
      }
    };
  }

  function createNight2() {
    const moteSpawns = [
      ...ringPoints(0, 0, 0, 10, 4, 0),
      ...ringPoints(0, 0, 0, 22, 8, 0),
      ...ringPoints(70, 0, 0, 10, 4, 0),
      ...ringPoints(70, 0, 0, 22, 8, 0)
    ];
    const shadeSpawns = [
      ...ringPoints(0, 0, 0, 26, 8, 22.5),
      ...ringPoints(70, 0, 0, 26, 8, 22.5)
    ];
    return {
      night: 2,
      name: 'Đảo Cau',
      subtitle: 'Hai hòn đảo song sinh nối bằng cầu tre lắt lẻo',
      elderQuote: 'Cẩn thận cây cầu tre nối hai đảo và những dải Gió Lạc chuyên rình cướp ánh sáng.',
      startPos: [0, 0, 0],
      lanterns: [
        { id: 'L1', pos: [0, 0, 20] },
        { id: 'L2', pos: [17, 0, -10] },
        { id: 'L3', pos: [-17, 0, -10] },
        { id: 'L4', pos: [70, 0, 20] },
        { id: 'L5', pos: [87, 0, -10] },
        { id: 'L6', pos: [53, 0, -10] }
      ],
      moteSpawns,
      shadeSpawns,
      shadeSpawnIntervalTicks: 420, // 7s
      shadeMax: 8,
      driftersEnabled: true,
      drifterSpawns: [
        [35, 0, 14],
        [35, 0, -14],
        [0, 0, -24],
        [70, 0, 24]
      ],
      charms: [
        { id: 'C1', pos: [35, 0, 0] }
      ],
      windEnabled: false,
      jumpPads: [
        { pos: [20, 0, 18], radius: 1.0, vy: 14.0, vHoriz: 24.0, target: [70, 0, 0] },
        { pos: [50, 0, -18], radius: 1.0, vy: 14.0, vHoriz: 24.0, target: [0, 0, 0] }
      ],
      obstacles: [],
      getFloorY(x, z, currentY) {
        const dA = Math.hypot(x, z);
        if (dA <= 28.0) return 0;
        const dB = Math.hypot(x - 70, z);
        if (dB <= 28.0) return 0;
        // Bamboo bridge x in [26, 44], z in [-2, 2]
        if (x >= 26.0 && x <= 44.0 && z >= -2.0 && z <= 2.0) return 0;
        return null;
      }
    };
  }

  function createNight3() {
    // 30 mote spawns: 18 on tier 0 r=34 (every 20°), 8 on tier 1 r=18 (20..160°), 4 on tier 2 r=5 (45..315°)
    const moteSpawns = [
      ...ringPoints(0, 0, 0, 34, 18, 0)
    ];
    for (let deg = 20; deg <= 160; deg += 20) {
      const rad = (deg * Math.PI) / 180;
      moteSpawns.push([round3(Math.cos(rad) * 18), 3, round3(Math.sin(rad) * 18)]);
    }
    for (const deg of [45, 135, 225, 315]) {
      const rad = (deg * Math.PI) / 180;
      moteSpawns.push([round3(Math.cos(rad) * 5), 6, round3(Math.sin(rad) * 5)]);
    }

    const shadeSpawns = ringPoints(0, 0, 0, 43, 16, 0);

    // Ramp helper: 30° and 150°, width 3m (half-width 1.5m), r from 24 (Y=3) to 30 (Y=0)
    const rampAngles = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];

    function getRampY(x, z) {
      for (const ang of rampAngles) {
        const ux = Math.cos(ang);
        const uz = Math.sin(ang);
        const along = x * ux + z * uz; // radial projection
        const perp = Math.abs(-x * uz + z * ux);
        if (along >= 24.0 && along <= 30.0 && perp <= 1.5) {
          return 3.0 * ((30.0 - along) / 6.0);
        }
      }
      return null;
    }

    return {
      night: 3,
      name: 'Đảo Chuông',
      subtitle: 'Ngọn đảo ba tầng linh thiêng với gió bão và tháp chuông cổ',
      elderQuote: 'Đêm cuối đã tới! Hãy vượt dốc lên tầng cao, mượn sức gió và giữ đảo sáng tới bình minh.',
      startPos: [0, 0, 0],
      lanterns: [
        { id: 'L1', pos: [0, 6, 6] },
        { id: 'L2', pos: [18, 3, 10] },
        { id: 'L3', pos: [-18, 3, 10] },
        { id: 'L4', pos: [35, 0, -10] },
        { id: 'L5', pos: [-35, 0, -10] },
        { id: 'L6', pos: [20, 0, -35] },
        { id: 'L7', pos: [-20, 0, -35] }
      ],
      moteSpawns,
      shadeSpawns,
      shadeSpawnIntervalTicks: 360, // 6s
      shadeMax: 10,
      driftersEnabled: true,
      drifterSpawns: [
        [28, 0, 28],
        [-28, 0, 28],
        [0, 0, -38],
        [38, 0, 0]
      ],
      charms: [
        { id: 'C1', pos: [30, 0, 25] },
        { id: 'C2', pos: [-30, 0, 25] }
      ],
      windEnabled: true,
      jumpPads: [
        { pos: [0, 3, 13], radius: 1.0, vy: 12.0, vHoriz: 8.0, dir: [0, -1] }
      ],
      obstacles: [
        { id: 'bell_tower', type: 'cylinder', pos: [0, 6, 0], radius: 2.0, minY: 6.0, maxY: 14.0 }
      ],
      getFloorY(x, z, currentY) {
        const r = Math.hypot(x, z);
        if (r > 45.0) return null;

        let best = 0;
        // Tier 2: disc r <= 8 at Y=6
        if (r <= 8.0 && currentY >= 5.5) {
          best = Math.max(best, 6.0);
        }
        // Tier 1: annulus 12 <= r <= 24, z > 0 at Y=3
        if (r >= 12.0 && r <= 24.0 && z > 0 && currentY >= 2.5) {
          best = Math.max(best, 3.0);
        }
        // Ramps: Y from 0 to 3
        const rampY = getRampY(x, z);
        if (rampY !== null && currentY >= rampY - 0.8) {
          best = Math.max(best, rampY);
        }
        return best;
      }
    };
  }

  function getMap(night) {
    switch (Number(night)) {
      case 2:
        return createNight2();
      case 3:
        return createNight3();
      case 1:
      default:
        return createNight1();
    }
  }

  return { getMap };
});

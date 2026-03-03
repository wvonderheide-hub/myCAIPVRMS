const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const CONFIG = {
  width: 800,
  height: 600,
  turnSpeed: 0.08,
  thrustPower: 0.16,
  friction: 0.99,
  maxSpeed: 6,
  laserSpeed: 9,
  laserLife: 60,
  shootCooldown: 180,
  invulnerabilityMs: 1500,
  respawnDelayMs: 700,
  startingLives: 3,
  baseAsteroidSpeed: 1.25,
  starsCount: 140,
};

let state;
let lastTime = 0;

const keys = {
  ArrowLeft: false,
  ArrowRight: false,
  ArrowUp: false,
  Space: false,
};

function createStars() {
  return Array.from({ length: CONFIG.starsCount }, () => ({
    x: Math.random() * CONFIG.width,
    y: Math.random() * CONFIG.height,
    size: Math.random() * 2 + 0.2,
    alpha: Math.random() * 0.7 + 0.2,
  }));
}

function createShip() {
  return {
    x: CONFIG.width / 2,
    y: CONFIG.height / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    radius: 14,
    alive: true,
    invulnerableUntil: performance.now() + CONFIG.invulnerabilityMs,
    respawnAt: 0,
  };
}

function asteroidRadiusBySize(size) {
  if (size === 3) return 44;
  if (size === 2) return 28;
  return 17;
}

function pointsBySize(size) {
  if (size === 3) return 20;
  if (size === 2) return 50;
  return 100;
}

function randomEdgePosition(radius) {
  const edge = Math.floor(Math.random() * 4);
  if (edge === 0) return { x: Math.random() * CONFIG.width, y: -radius - 2 };
  if (edge === 1) return { x: CONFIG.width + radius + 2, y: Math.random() * CONFIG.height };
  if (edge === 2) return { x: Math.random() * CONFIG.width, y: CONFIG.height + radius + 2 };
  return { x: -radius - 2, y: Math.random() * CONFIG.height };
}

function createAsteroid(size = 3, x = null, y = null) {
  const radius = asteroidRadiusBySize(size);
  const pos = x === null || y === null ? randomEdgePosition(radius) : { x, y };
  const angle = Math.random() * Math.PI * 2;
  const speed = (CONFIG.baseAsteroidSpeed + Math.random() * 0.7) * (1 + (3 - size) * 0.15);

  // Kleine, zufällige Unebenheiten sorgen für den typischen Asteroiden-Look.
  const vertices = 10 + Math.floor(Math.random() * 5);
  const offsets = Array.from({ length: vertices }, () => 0.75 + Math.random() * 0.45);

  return {
    x: pos.x,
    y: pos.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.02,
    size,
    radius,
    vertices,
    offsets,
  };
}

function createLaser(ship) {
  return {
    x: ship.x + Math.cos(ship.angle) * ship.radius,
    y: ship.y + Math.sin(ship.angle) * ship.radius,
    vx: ship.vx + Math.cos(ship.angle) * CONFIG.laserSpeed,
    vy: ship.vy + Math.sin(ship.angle) * CONFIG.laserSpeed,
    life: CONFIG.laserLife,
    radius: 2,
  };
}

function wrap(obj) {
  if (obj.x < -obj.radius) obj.x = CONFIG.width + obj.radius;
  if (obj.x > CONFIG.width + obj.radius) obj.x = -obj.radius;
  if (obj.y < -obj.radius) obj.y = CONFIG.height + obj.radius;
  if (obj.y > CONFIG.height + obj.radius) obj.y = -obj.radius;
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function splitAsteroid(asteroid) {
  const fragments = [];
  if (asteroid.size > 1) {
    fragments.push(createAsteroid(asteroid.size - 1, asteroid.x, asteroid.y));
    fragments.push(createAsteroid(asteroid.size - 1, asteroid.x, asteroid.y));
  }
  return fragments;
}

function spawnWave(level) {
  const count = 3 + level;
  for (let i = 0; i < count; i += 1) {
    state.asteroids.push(createAsteroid(3));
  }
}

function resetGame() {
  state = {
    stars: createStars(),
    ship: createShip(),
    asteroids: [],
    lasers: [],
    score: 0,
    lives: CONFIG.startingLives,
    level: 1,
    gameOver: false,
    lastShotAt: 0,
  };
  spawnWave(state.level);
}

function handleInput(now) {
  const ship = state.ship;
  if (!ship.alive || state.gameOver) return;

  if (keys.ArrowLeft) ship.angle -= CONFIG.turnSpeed;
  if (keys.ArrowRight) ship.angle += CONFIG.turnSpeed;

  if (keys.ArrowUp) {
    ship.vx += Math.cos(ship.angle) * CONFIG.thrustPower;
    ship.vy += Math.sin(ship.angle) * CONFIG.thrustPower;
  }

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > CONFIG.maxSpeed) {
    ship.vx = (ship.vx / speed) * CONFIG.maxSpeed;
    ship.vy = (ship.vy / speed) * CONFIG.maxSpeed;
  }

  if (keys.Space && now - state.lastShotAt > CONFIG.shootCooldown) {
    state.lasers.push(createLaser(ship));
    state.lastShotAt = now;
  }
}

function update(now) {
  if (!state.gameOver) {
    handleInput(now);
  }

  const ship = state.ship;
  if (ship.alive) {
    ship.vx *= CONFIG.friction;
    ship.vy *= CONFIG.friction;
    ship.x += ship.vx;
    ship.y += ship.vy;
    wrap(ship);
  } else if (!state.gameOver && now >= ship.respawnAt) {
    state.ship = createShip();
  }

  for (const asteroid of state.asteroids) {
    asteroid.x += asteroid.vx;
    asteroid.y += asteroid.vy;
    asteroid.angle += asteroid.spin;
    wrap(asteroid);
  }

  state.lasers = state.lasers.filter((laser) => {
    laser.x += laser.vx;
    laser.y += laser.vy;
    laser.life -= 1;
    wrap(laser);
    return laser.life > 0;
  });

  // Laser-Asteroiden-Kollisionen verarbeiten (inkl. Splitten).
  const newAsteroids = [];
  state.asteroids = state.asteroids.filter((asteroid) => {
    let hitByLaser = false;

    state.lasers = state.lasers.filter((laser) => {
      const hit = distanceSquared(laser, asteroid) <= (laser.radius + asteroid.radius) ** 2;
      if (hit && !hitByLaser) {
        hitByLaser = true;
        state.score += pointsBySize(asteroid.size);
        newAsteroids.push(...splitAsteroid(asteroid));
      }
      return !hit;
    });

    return !hitByLaser;
  });
  state.asteroids.push(...newAsteroids);

  // Schiff trifft Asteroid: Leben reduzieren und Respawn mit kurzer Unverwundbarkeit.
  if (ship.alive && now > ship.invulnerableUntil && !state.gameOver) {
    for (const asteroid of state.asteroids) {
      const hit = distanceSquared(ship, asteroid) <= (ship.radius + asteroid.radius) ** 2;
      if (hit) {
        state.lives -= 1;
        ship.alive = false;
        ship.respawnAt = now + CONFIG.respawnDelayMs;
        ship.vx = 0;
        ship.vy = 0;

        if (state.lives <= 0) {
          state.gameOver = true;
        }
        break;
      }
    }
  }

  if (!state.gameOver && state.asteroids.length === 0) {
    state.level += 1;
    spawnWave(state.level);
  }
}

function drawStars() {
  for (const star of state.stars) {
    ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShip(ship, now) {
  if (!ship.alive) return;

  const blinking = now < ship.invulnerableUntil && Math.floor(now / 100) % 2 === 0;
  if (blinking) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle + Math.PI / 2);

  ctx.strokeStyle = "#d6ebff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -ship.radius);
  ctx.lineTo(ship.radius * 0.75, ship.radius);
  ctx.lineTo(0, ship.radius * 0.5);
  ctx.lineTo(-ship.radius * 0.75, ship.radius);
  ctx.closePath();
  ctx.stroke();

  if (keys.ArrowUp && !state.gameOver) {
    ctx.strokeStyle = "#ffa24d";
    ctx.beginPath();
    ctx.moveTo(-5, ship.radius);
    ctx.lineTo(0, ship.radius + 10 + Math.random() * 4);
    ctx.lineTo(5, ship.radius);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAsteroid(asteroid) {
  ctx.save();
  ctx.translate(asteroid.x, asteroid.y);
  ctx.rotate(asteroid.angle);
  ctx.strokeStyle = "#9ab2d9";
  ctx.lineWidth = 2;
  ctx.beginPath();

  for (let i = 0; i < asteroid.vertices; i += 1) {
    const angle = (i / asteroid.vertices) * Math.PI * 2;
    const radius = asteroid.radius * asteroid.offsets[i];
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "#e8f0ff";
  ctx.font = "bold 22px Segoe UI";
  ctx.fillText(`Score: ${state.score}`, 18, 34);
  ctx.fillText(`Lives: ${state.lives}`, 18, 64);

  if (state.gameOver) {
    ctx.textAlign = "center";
    ctx.font = "bold 56px Segoe UI";
    ctx.fillText("GAME OVER", CONFIG.width / 2, CONFIG.height / 2 - 10);
    ctx.font = "22px Segoe UI";
    ctx.fillText("Drücke R für Neustart", CONFIG.width / 2, CONFIG.height / 2 + 36);
    ctx.textAlign = "left";
  }
}

function render(now) {
  ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
  drawStars();

  for (const laser of state.lasers) {
    ctx.fillStyle = "#ff7058";
    ctx.beginPath();
    ctx.arc(laser.x, laser.y, laser.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const asteroid of state.asteroids) {
    drawAsteroid(asteroid);
  }

  drawShip(state.ship, now);
  drawHud();
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  lastTime = timestamp;

  update(timestamp);
  render(timestamp);

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (event.code in keys) {
    keys[event.code] = true;
    event.preventDefault();
  }

  if (event.code === "KeyR") {
    resetGame();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code in keys) {
    keys[event.code] = false;
    event.preventDefault();
  }
});

resetGame();
requestAnimationFrame(loop);

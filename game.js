document.addEventListener('DOMContentLoaded', function() {
    const nicknameInput = document.getElementById('nickname');
    const startBtn = document.getElementById('startBtn');
    const startScreen = document.getElementById('start-screen');
    const scene = document.querySelector('a-scene');
    const gameUI = document.getElementById('game-ui');

    // 게임 UI 초기에 숨기기
    if (gameUI) gameUI.style.display = 'none';

    // 닉네임 입력 감지
    nicknameInput.addEventListener('input', function() {
        if (nicknameInput.value.trim().length > 0) {
            startBtn.removeAttribute('disabled');
            startBtn.classList.add('active');
        } else {
            startBtn.setAttribute('disabled', 'true');
            startBtn.classList.remove('active');
        }
    });

    // 시작 버튼 클릭
    startBtn.addEventListener('click', async function() {
        if (nicknameInput.value.trim().length > 0) {
            localStorage.setItem('playerNickname', nicknameInput.value.trim());
            startScreen.style.display = 'none';
            if (gameUI) gameUI.style.display = 'block';
            
            const gameManager = scene.components['game-manager'];
            if (gameManager) {
                await gameManager.startCountdown();
                gameManager.startGame();  // 카운트다운 후 게임 시작
            }
        }
    });
});

// 게임 관련 상수
const GAME_CONFIG = {
  ASTEROID: {
      WIDTH: 0.067,
      HEIGHT: 0.067,
      INITIAL_SPEED: 0.005,  // 초기 속도
      SPEED_VARIANCE: 0.3,
      MIN_COUNT: 6,          // 최소 공의 개수
      SPAWN_INTERVAL: 1000,  // 공 생성 주기 (1초)
      SPAWN_COUNT: {         // 스테이지별 생성 개수
          INITIAL: 1,        // 초기 생성 개수
          MAX: 3            // 최대 생성 개수 (스테이지 10에서)
      },
      MAX_COUNT: 20,         // 전체 최대 공의 개수
      OPACITY: 0.9
  },
  PLAYER: {
      WIDTH: 0.1,
      HEIGHT: 0.1,
      OPACITY: 0.9
  },
  SPAWN: {
      MIN_X: -5,
      MAX_X: 5,
      MIN_Y: -4,
      MAX_Y: 4,
      Z: -3
  },
  SCORE: {
      MOVEMENT: 10,        // 움직임당 점수
      STAGE_CLEAR: 1000,   // 스테이지 클리어 보너스
      ASTEROID_AVOID: 10   // 소행성 회피 점수 (기존)
  },
  STAGE: {
      DURATION: 60000,     // 스테이지 지속 시간 (60초)
      TRANSITION: 10000,   // 다음 스테이지 전환 시간 (10초)
  }
};

AFRAME.registerComponent('game-manager', {
  init: function() {
      this.score = 0;
      this.stage = 1;
      this.asteroidSpeed = GAME_CONFIG.ASTEROID.INITIAL_SPEED;
      this.asteroids = [];
      this.isPlaying = false;
      this.isTransitioning = false;
      this.spawnInterval = null;  // 공 생성 인터벌 변수 추가
      this.currentSpawnCount = GAME_CONFIG.ASTEROID.SPAWN_COUNT.INITIAL;  // 현재 생성 개수
      this.gameStarted = false;  // 게임 시작 여부를 추적하는 새로운 변수
      this.movementThreshold = 0.01;
      
      this.scoreElement = document.getElementById("score");
      this.stageElement = document.getElementById("stage");
      this.timerElement = document.getElementById("timer");
      this.player = document.querySelector("#player");
      this.lastPosition = {x: 0, y: 0, z: -3};
      this.countdownElement = document.getElementById("countdown");
      
      // 닉네임 표시
      const playerNickname = localStorage.getItem('playerNickname');
      if (playerNickname) {
          const nicknameElement = document.createElement('div');
          nicknameElement.textContent = playerNickname;
          nicknameElement.style.position = 'fixed';
          nicknameElement.style.top = '10px';
          nicknameElement.style.right = '20px';
          nicknameElement.style.color = '#64ffda';
          nicknameElement.style.fontFamily = "'Press Start 2P', cursive";
          nicknameElement.style.textShadow = '2px 2px #000';
          document.body.appendChild(nicknameElement);
      }
      
      // 게임 초기화는 startCountdown에서 수행

      // 이미지 로드 확인
      this.checkAssetsLoaded();
      
      // 이전 위치 저장을 위한 변수 추가
      this.lastPlayerPos = {x: 0, y: 0, z: -3};
      this.movementThreshold = 0.01; // 움직임 감지 임계값
  },

  checkAssetsLoaded: function() {
      const playerSprite = document.getElementById('player-sprite');
      const asteroidSprite = document.getElementById('asteroid-sprite');
      
      // 이미지 로드 확인
      if (!playerSprite.complete || !asteroidSprite.complete) {
          console.log('이미지 로딩 중...');
          setTimeout(() => this.checkAssetsLoaded(), 100);
          return;
      }

      console.log('이미지 로드 완료!');
      this.player.setAttribute('visible', 'true');
  },

  startCountdown: function() {
      this.isCounting = true;
      this.isPlaying = false;
      this.asteroids = [];
      
      // 플레이어 초기 위치 설정
      this.player.setAttribute('position', {x: 0, y: 0, z: -3});
      this.lastPosition = {x: 0, y: 0, z: -3};
      
      this.countdownElement.style.display = 'block';
      let count = 3;
      
      return new Promise((resolve) => {
          const countInterval = setInterval(() => {
              if (count > 0) {
                  this.countdownElement.textContent = count;
                  count--;
              } else {
                  clearInterval(countInterval);
                  this.countdownElement.style.display = 'none';
                  this.isCounting = false;
                  this.isPlaying = true;
                  resolve();
              }
          }, 1000);
      });
  },

  createAsteroid: function() {
      const asteroid = document.createElement('a-entity');
      asteroid.setAttribute('geometry', {
          primitive: 'plane',
          width: GAME_CONFIG.ASTEROID.WIDTH,
          height: GAME_CONFIG.ASTEROID.HEIGHT
      });
      asteroid.setAttribute('material', {
          src: '#asteroid-sprite',
          transparent: true,
          opacity: GAME_CONFIG.ASTEROID.OPACITY
      });
      
      const position = this.getRandomStartPosition();
      asteroid.setAttribute('position', position);
      
      // 플레이어 위치를 향하도록 방향 설정
      const playerPos = this.player.getAttribute('position');
      const direction = {
          x: playerPos.x - position.x,
          y: playerPos.y - position.y,
          z: playerPos.z - position.z
      };
      
      // 방향 정규화
      const length = Math.sqrt(
          direction.x * direction.x + 
          direction.y * direction.y + 
          direction.z * direction.z
      );
      
      direction.x /= length;
      direction.y /= length;
      direction.z /= length;
      
      this.el.sceneEl.appendChild(asteroid);
      
      const speed = this.asteroidSpeed * (1 + Math.random() * GAME_CONFIG.ASTEROID.SPEED_VARIANCE);
      
      return {
          element: asteroid,
          position: position,
          direction: direction,
          speed: speed
      };
  },

  tick: function() {
      if (!this.gameStarted || !this.isPlaying || this.isTransitioning) return;
      
      // 플레이어 움직임 체크 및 점수 부여
      this.checkPlayerMovement();
      
      // 소소 공 개수 유지
      while (this.asteroids.length < GAME_CONFIG.ASTEROID.MIN_COUNT) {
          this.asteroids.push(this.createAsteroid());
      }
      
      this.updateAsteroids();
  },

  checkPlayerMovement: function() {
      const currentPos = this.player.getAttribute('position');
      const dx = currentPos.x - this.lastPlayerPos.x;
      const dy = currentPos.y - this.lastPlayerPos.y;
      
      // 움직임이 임계값을 넘으면 점수 부여
      if (Math.abs(dx) > this.movementThreshold || Math.abs(dy) > this.movementThreshold) {
          this.addScore(GAME_CONFIG.SCORE.MOVEMENT); // 움직임 점수 추가 (10점)
      }
      
      // 현재 위치를 이전 위치로 저장
      this.lastPlayerPos = {...currentPos};
  },

  addScore: function(points) {
      this.score += points;
      this.scoreElement.textContent = `점수: ${this.score}`;
  },

  startStageTimer: function() {
      this.stageStartTime = Date.now();
      this.updateTimer();
      
      this.stageTimer = setInterval(() => {
          if (this.isTransitioning) return;
          
          const elapsed = Date.now() - this.stageStartTime;
          const remaining = Math.max(0, Math.ceil((GAME_CONFIG.STAGE.DURATION - elapsed) / 1000));
          
          this.updateTimer();
          
          if (elapsed >= GAME_CONFIG.STAGE.DURATION) {
              this.stageComplete();
          }
      }, 1000);
  },

  updateTimer: function() {
      const elapsed = Date.now() - this.stageStartTime;
      const remaining = Math.max(0, Math.ceil((GAME_CONFIG.STAGE.DURATION - elapsed) / 1000));
      this.timerElement.textContent = `시: ${remaining}초`;
  },

  stageComplete: function() {
      this.isTransitioning = true;
      clearInterval(this.stageTimer);
      
      // 스테이지 클리어 보너스 추가
      this.addScore(GAME_CONFIG.SCORE.STAGE_CLEAR);
      
      // 스테이지 클리어 메시지
      const message = document.getElementById("stage-message");
      message.textContent = `스테이지 ${this.stage} 클리어! (보너스 +${GAME_CONFIG.SCORE.STAGE_CLEAR}점)\n10초 후 다음 스테이지가 시작됩니.`;
      message.style.display = "block";
      
      // 모든 현재 소행성 제거
      this.asteroids.forEach(asteroid => {
          this.el.sceneEl.removeChild(asteroid.element);
      });
      this.asteroids = [];
      
      // 다음 스테이지 준비
      setTimeout(() => {
          this.startNextStage();
          message.style.display = "none";
      }, GAME_CONFIG.STAGE.TRANSITION);
  },

  startNextStage: function() {
      this.isTransitioning = true;
      this.stage += 1;
      
      // 스테이지 클리어 보너스 점수 추가
      this.addScore(GAME_CONFIG.SCORE.STAGE_CLEAR);
      
      // 스테이지 정보 업데이트
      this.stageElement.textContent = `스테이지: ${this.stage}`;
      
      // 난이도 조정
      if (this.stage <= 10) {
          // 스테이지 10까지는 생성 개수 증가
          this.currentSpawnCount = Math.min(
              GAME_CONFIG.ASTEROID.SPAWN_COUNT.MAX,
              GAME_CONFIG.ASTEROID.SPAWN_COUNT.INITIAL + Math.floor((this.stage - 1) / 2)
          );
      } else {
          // 스테이지 10 이후에는 속도 증가
          this.asteroidSpeed *= 1.1;
      }
      
      // 스테이지 메시지 표시
      const stageMessage = document.getElementById('stage-message');
      stageMessage.textContent = `스테이지 ${this.stage} 시작!`;
      stageMessage.style.display = 'block';
      
      // 3초 후 다음 스테이지 시작
      setTimeout(() => {
          stageMessage.style.display = 'none';
          this.isTransitioning = false;
          this.startStageTimer();
      }, 3000);
  },

  getRandomStartPosition: function() {
      const side = Math.floor(Math.random() * 4);
      let position = {x: 0, y: 0, z: GAME_CONFIG.SPAWN.Z};
      
      switch(side) {
          case 0: // 위쪽
              position.x = (Math.random() * (GAME_CONFIG.SPAWN.MAX_X - GAME_CONFIG.SPAWN.MIN_X)) + GAME_CONFIG.SPAWN.MIN_X;
              position.y = GAME_CONFIG.SPAWN.MAX_Y;
              break;
          case 1: // 오른쪽
              position.x = GAME_CONFIG.SPAWN.MAX_X;
              position.y = (Math.random() * (GAME_CONFIG.SPAWN.MAX_Y - GAME_CONFIG.SPAWN.MIN_Y)) + GAME_CONFIG.SPAWN.MIN_Y;
              break;
          case 2: // 아래쪽
              position.x = (Math.random() * (GAME_CONFIG.SPAWN.MAX_X - GAME_CONFIG.SPAWN.MIN_X)) + GAME_CONFIG.SPAWN.MIN_X;
              position.y = GAME_CONFIG.SPAWN.MIN_Y;
              break;
          case 3: // 왼쪽
              position.x = GAME_CONFIG.SPAWN.MIN_X;
              position.y = (Math.random() * (GAME_CONFIG.SPAWN.MAX_Y - GAME_CONFIG.SPAWN.MIN_Y)) + GAME_CONFIG.SPAWN.MIN_Y;
              break;
      }
      
      return position;
  },

  updateAsteroids: function() {
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
          const asteroid = this.asteroids[i];
          const position = asteroid.position;
          
          position.x += asteroid.direction.x * asteroid.speed;
          position.y += asteroid.direction.y * asteroid.speed;
          position.z += asteroid.direction.z * asteroid.speed;
          
          asteroid.element.setAttribute('position', position);
          
          if (this.isOutOfBounds(position)) {
              this.removeAsteroid(i);
              continue;
          }
          
          if (this.checkCollision(position)) {
              this.gameOver();
              return;
          }
      }
  },

  isOutOfBounds: function(position) {
      return Math.abs(position.x) > 4 || 
             Math.abs(position.y) > 4 || 
             Math.abs(position.z) > 5;
  },

  removeAsteroid: function(index) {
      const asteroid = this.asteroids[index];
      this.el.sceneEl.removeChild(asteroid.element);
      this.asteroids.splice(index, 1);
      
      // 공이 제거된 후 최소 개수 확인
      if (this.asteroids.length < GAME_CONFIG.ASTEROID.MIN_COUNT) {
          this.asteroids.push(this.createAsteroid());
      }
  },

  checkCollision: function(asteroidPosition) {
      // 게임이 시작되지 않았거나 카운트다운 중이면 충돌 체크 안함
      if (!this.gameStarted || this.isCounting) return false;
      
      const playerPos = this.player.getAttribute('position');
      const distance = Math.sqrt(
          Math.pow(playerPos.x - asteroidPosition.x, 2) +
          Math.pow(playerPos.y - asteroidPosition.y, 2)
      );
      
      const collisionThreshold = 
          (GAME_CONFIG.PLAYER.WIDTH + GAME_CONFIG.ASTEROID.WIDTH) / 3;
      
      return distance < collisionThreshold;
  },

  gameOver: function() {
      // 인터벌 정리
      if (this.spawnInterval) {
          clearInterval(this.spawnInterval);
      }
      
      const nickname = localStorage.getItem('playerNickname') || '무명';
      const finalScore = this.score;
      const finalStage = this.stage;
      
      window.location.href = `scores.html?score=${finalScore}&stage=${finalStage}&nickname=${encodeURIComponent(nickname)}`;
  },

  startGame: function() {
      console.log("게임 시작!");
      this.gameStarted = true;
      this.isPlaying = true;
      
      // 공 생성 인터벌 시작
      this.startAsteroidSpawner();
      
      // 게임 시작 이벤트 발생
      const gameStartedEvent = new Event('gameStarted');
      document.dispatchEvent(gameStartedEvent);
      
      this.startStageTimer();
  },

  startAsteroidSpawner: function() {
      // 기존 인터벌 제거
      if (this.spawnInterval) {
          clearInterval(this.spawnInterval);
      }

      // 새로운 인터벌 설정
      this.spawnInterval = setInterval(() => {
          if (this.isPlaying && !this.isTransitioning) {
              // 현재 스테이지의 생성 개수만큼 공 생성
              for (let i = 0; i < this.currentSpawnCount; i++) {
                  if (this.asteroids.length < GAME_CONFIG.ASTEROID.MAX_COUNT) {
                      this.asteroids.push(this.createAsteroid());
                  }
              }
          }
      }, GAME_CONFIG.ASTEROID.SPAWN_INTERVAL);
  }
});

AFRAME.registerComponent('look-at-camera', {
  tick: function() {
      const camera = document.querySelector('[camera]');
      if (camera) {
          this.el.object3D.lookAt(camera.object3D.position);
      }
  }
});

"use strict";

/* =========================================================
   Constants
========================================================= */

const RANKS = [
    "3", "4", "5", "6", "7", "8", "9",
    "10", "J", "Q", "K", "A", "2"
];

const SUITS = [
    { code: "D", symbol: "♦", power: 0, red: true },
    { code: "C", symbol: "♣", power: 1, red: false },
    { code: "H", symbol: "♥", power: 2, red: true },
    { code: "S", symbol: "♠", power: 3, red: false }
];

const TYPE_NAMES = {
    single: "單張",
    pair: "一對",
    triple: "三條",
    straight: "蛇",
    flush: "花",
    fullHouse: "俘虜",
    fourKind: "四條",
    straightFlush: "同花順"
};

const FIVE_CARD_POWER = {
    straight: 0,
    flush: 1,
    fullHouse: 2,
    fourKind: 3,
    straightFlush: 4
};

const PLAYER_ICONS = ["😎", "🧑🏻", "👩🏻", "🧔🏻"];

/* =========================================================
   Network and game state
========================================================= */

const network = {
    peer: null,
    hostConnection: null,
    connections: new Map(),
    seats: [null, null, null, null],
    roomCode: "",
    localSeat: 0,
    isHost: false,
    connected: false,
    started: false
};

const game = {
    players: [],
    round: 1,
    dealer: null,
    winner: null,
    turn: 0,
    direction: 1,
    dealDirection: -1,
    firstTurn: true,
    roundOver: false,
    lastPlay: null,
    lastPlayer: null,
    passCount: 0,
    selected: new Set(),
    timeLeft: 30,
    timerId: null,
    aiTimer: null,
    wins: [0, 0, 0, 0],
    statusText: "等待遊戲開始",
    statusType: "notice"
};

/* =========================================================
   DOM elements
========================================================= */

const element = id => document.getElementById(id);

const menuElement = element("menu");
const menuActionsElement = element("menuActions");
const lobbyElement = element("lobby");
const seatsElement = element("seats");
const roomCodeElement = element("roomCode");
const lobbyStatusElement = element("lobbyStatus");
const menuMessageElement = element("menuMessage");

const nameInput = element("nameInput");
const codeInput = element("codeInput");

const createButton = element("createButton");
const joinButton = element("joinButton");
const startButton = element("startButton");
const copyButton = element("copyButton");

const handElement = element("hand");
const tableCardsElement = element("tableCards");
const trickLabelElement = element("trickLabel");
const messageElement = element("message");
const timerElement = element("timer");
const gameInfoElement = element("gameInfo");
const penaltyElement = element("penalty");

const playButton = element("playButton");
const passButton = element("passButton");
const hintButton = element("hintButton");
const clearButton = element("clearButton");
const nextButton = element("nextButton");
const deeButton = element("deeButton");

/* =========================================================
   Secure random numbers
========================================================= */

// Rejection sampling avoids modulo bias.
function secureRandomInteger(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error(
            "maxExclusive must be a positive integer."
        );
    }

    if (!window.crypto || !window.crypto.getRandomValues) {
        throw new Error(
            "This browser does not support secure random numbers."
        );
    }

    const fullRange = 0x100000000;
    const acceptableLimit =
        Math.floor(fullRange / maxExclusive) * maxExclusive;

    const randomBuffer = new Uint32Array(1);
    let randomValue;

    do {
        window.crypto.getRandomValues(randomBuffer);
        randomValue = randomBuffer[0];
    } while (randomValue >= acceptableLimit);

    return randomValue % maxExclusive;
}

// Secure Fisher-Yates shuffle.
function secureShuffle(array) {
    for (
        let currentIndex = array.length - 1;
        currentIndex > 0;
        currentIndex--
    ) {
        const randomIndex =
            secureRandomInteger(currentIndex + 1);

        [array[currentIndex], array[randomIndex]] =
            [array[randomIndex], array[currentIndex]];
    }

    return array;
}

function generateSecureRoomCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";

    for (let index = 0; index < 6; index++) {
        result += characters[
            secureRandomInteger(characters.length)
        ];
    }

    return result;
}

/* =========================================================
   General utility functions
========================================================= */

function safeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function cleanPlayerName(value) {
    return String(value || "")
        .replace(/[<>]/g, "")
        .trim()
        .slice(0, 16) || "玩家";
}

function peerRoomID(code) {
    return "chodai-d-" + code.toLowerCase();
}

function setMenuMessage(text, type = "") {
    menuMessageElement.textContent = text;
    menuMessageElement.className = type;
}

function lockMenuButtons(locked) {
    createButton.disabled = locked;
    joinButton.disabled = locked;
}

function nextSeat(playerIndex, direction = game.direction) {
    return (playerIndex + direction + 4) % 4;
}

function playerHandCount(playerIndex) {
    const player = game.players[playerIndex];

    if (!player) {
        return 0;
    }

    return player.handCount ?? player.hand.length;
}

function clearTurnTimers() {
    clearInterval(game.timerId);
    clearTimeout(game.aiTimer);

    game.timerId = null;
    game.aiTimer = null;
}

/* =========================================================
   Lobby: create room
========================================================= */

function createRoom() {
    if (typeof Peer === "undefined") {
        setMenuMessage(
            "無法載入網絡功能，請檢查網絡連線。",
            "error"
        );
        return;
    }

    const roomCode = generateSecureRoomCode();

    network.roomCode = roomCode;
    network.isHost = true;
    network.localSeat = 0;

    network.seats = [
        {
            name: cleanPlayerName(nameInput.value),
            bot: false
        },
        null,
        null,
        null
    ];

    lockMenuButtons(true);
    setMenuMessage("正在建立房間……");

    network.peer = new Peer(peerRoomID(roomCode));

    network.peer.on("open", () => {
        network.connected = true;

        showLobby();
        updateLobby();

        setMenuMessage("房間建立成功。", "good");
    });

    network.peer.on("connection", connection => {
        connection.on("data", data => {
            handleHostNetworkMessage(connection, data);
        });

        connection.on("close", () => {
            handleGuestDisconnected(connection);
        });

        connection.on("error", () => {
            handleGuestDisconnected(connection);
        });
    });

    network.peer.on("error", error => {
        console.error(error);

        setMenuMessage(
            "建立房間失敗：" + (error.type || error.message),
            "error"
        );

        lockMenuButtons(false);
    });
}

/* =========================================================
   Lobby: join room
========================================================= */

function joinRoom() {
    if (typeof Peer === "undefined") {
        setMenuMessage("無法載入網絡功能。", "error");
        return;
    }

    const roomCode = codeInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);

    if (roomCode.length !== 6) {
        setMenuMessage(
            "請輸入有效的 6 位房間代碼。",
            "error"
        );
        return;
    }

    network.roomCode = roomCode;
    network.isHost = false;

    lockMenuButtons(true);
    setMenuMessage("正在加入房間……");

    network.peer = new Peer();

    network.peer.on("open", () => {
        const connection = network.peer.connect(
            peerRoomID(roomCode),
            {
                reliable: true,
                serialization: "json"
            }
        );

        network.hostConnection = connection;

        connection.on("open", () => {
            connection.send({
                type: "hello",
                name: cleanPlayerName(nameInput.value)
            });
        });

        connection.on("data", handleClientNetworkMessage);

        connection.on("close", () => {
            if (network.connected) {
                clearTurnTimers();
                alert("房主已離線，遊戲中止。");
                window.location.reload();
            }
        });

        connection.on("error", error => {
            console.error(error);
            setMenuMessage("無法連接房間。", "error");
            lockMenuButtons(false);
        });

        window.setTimeout(() => {
            if (!network.connected) {
                setMenuMessage(
                    "找不到房間，請確認代碼。",
                    "error"
                );
                lockMenuButtons(false);
            }
        }, 9000);
    });

    network.peer.on("error", error => {
        console.error(error);

        setMenuMessage(
            "連線錯誤：" + (error.type || error.message),
            "error"
        );

        lockMenuButtons(false);
    });
}

/* =========================================================
   Host network message handling
========================================================= */

function handleHostNetworkMessage(connection, data) {
    if (!data || typeof data !== "object") {
        return;
    }

    if (data.type === "hello") {
        acceptGuest(connection, data.name);
        return;
    }

    if (data.type === "action") {
        handleRemoteAction(connection, data);
    }
}

function acceptGuest(connection, requestedName) {
    if (network.started) {
        connection.send({
            type: "connectionError",
            message: "遊戲已經開始。"
        });

        window.setTimeout(() => connection.close(), 300);
        return;
    }

    if (connection.playerSeat !== undefined) {
        return;
    }

    const availableSeat = network.seats.findIndex(
        (seat, index) => index > 0 && seat === null
    );

    if (availableSeat === -1) {
        connection.send({
            type: "connectionError",
            message: "房間已滿。"
        });

        window.setTimeout(() => connection.close(), 300);
        return;
    }

    connection.playerSeat = availableSeat;
    network.connections.set(availableSeat, connection);

    network.seats[availableSeat] = {
        name: cleanPlayerName(requestedName),
        bot: false
    };

    connection.send({
        type: "assigned",
        seat: availableSeat,
        seats: network.seats,
        roomCode: network.roomCode
    });

    broadcastLobby();
    updateLobby();
}

/* =========================================================
   Client network message handling
========================================================= */

function handleClientNetworkMessage(data) {
    if (!data || typeof data !== "object") {
        return;
    }

    if (data.type === "assigned") {
        network.localSeat = data.seat;
        network.seats = data.seats;
        network.connected = true;

        showLobby();
        updateLobby();

        setMenuMessage("成功加入房間。", "good");
        return;
    }

    if (data.type === "lobby") {
        network.seats = data.seats;
        updateLobby();
        return;
    }

    if (data.type === "state") {
        network.started = true;
        menuElement.classList.add("hidden");

        applyNetworkState(data.state);
        return;
    }

    if (data.type === "actionError") {
        setMessage(
            data.message || "房主拒絕了這個操作。",
            "bad"
        );
        return;
    }

    if (data.type === "connectionError") {
        setMenuMessage(data.message, "error");
        lockMenuButtons(false);
    }
}

/* =========================================================
   Disconnection handling
========================================================= */

function handleGuestDisconnected(connection) {
    if (connection.playerSeat === undefined) {
        return;
    }

    const disconnectedSeat = connection.playerSeat;
    network.connections.delete(disconnectedSeat);

    if (!network.started) {
        network.seats[disconnectedSeat] = null;
        broadcastLobby();
        updateLobby();
        return;
    }

    const originalName =
        game.players[disconnectedSeat]?.name || "玩家";

    network.seats[disconnectedSeat] = {
        name: originalName + "（電腦接管）",
        bot: true
    };

    if (game.players[disconnectedSeat]) {
        game.players[disconnectedSeat].name =
            network.seats[disconnectedSeat].name;

        game.players[disconnectedSeat].bot = true;
    }

    setMessage(
        originalName + " 已離線，由電腦接管。",
        "bad"
    );

    synchronizeGameState();

    if (
        game.turn === disconnectedSeat &&
        !game.roundOver
    ) {
        clearTurnTimers();
        beginTurn();
    }
}

/* =========================================================
   Lobby rendering
========================================================= */

function showLobby() {
    menuActionsElement.classList.add("hidden");
    lobbyElement.classList.remove("hidden");

    roomCodeElement.textContent = network.roomCode;

    startButton.classList.toggle(
        "hidden",
        !network.isHost
    );
}

function updateLobby() {
    seatsElement.innerHTML = "";

    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
        const seat = network.seats[seatIndex];
        const seatElement = document.createElement("div");

        seatElement.className = "seat " + (seat ? "ready" : "");

        seatElement.innerHTML = `
            <span>
                ${seatIndex === 0 ? "👑" : "🪑"}
                座位 ${seatIndex + 1}：
                ${seat ? safeHTML(seat.name) : "等待玩家"}
            </span>

            <small>
                ${
                    seat
                        ? (seat.bot ? "電腦" : "已連線")
                        : "空位／電腦補上"
                }
            </small>
        `;

        seatsElement.appendChild(seatElement);
    }

    const humanCount = network.seats.filter(
        seat => seat && !seat.bot
    ).length;

    lobbyStatusElement.textContent = network.isHost
        ? `目前有 ${humanCount} 位真人玩家，可以隨時開始。`
        : `目前有 ${humanCount} 位真人玩家，等待房主開始。`;
}

function broadcastLobby() {
    if (!network.isHost) {
        return;
    }

    for (const connection of network.connections.values()) {
        if (connection.open) {
            connection.send({
                type: "lobby",
                seats: network.seats
            });
        }
    }
}

function startOnlineGame() {
    if (!network.isHost || network.started) {
        return;
    }

    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
        if (!network.seats[seatIndex]) {
            network.seats[seatIndex] = {
                name: `電腦 ${seatIndex + 1}`,
                bot: true
            };
        }
    }

    network.started = true;
    menuElement.classList.add("hidden");

    startRound();
}

/* =========================================================
   Deck creation and secure distribution
========================================================= */

function createDeck() {
    const deck = [];
    let cardID = 0;

    for (
        let rankPower = 0;
        rankPower < RANKS.length;
        rankPower++
    ) {
        for (const suit of SUITS) {
            deck.push({
                id: cardID++,
                rank: RANKS[rankPower],
                rankPower,
                suit: suit.code,
                suitPower: suit.power,
                symbol: suit.symbol,
                red: suit.red
            });
        }
    }

    return deck;
}

function sortHand(hand) {
    hand.sort((first, second) =>
        first.rankPower - second.rankPower ||
        first.suitPower - second.suitPower
    );
}

function findDiamondThreeOwner() {
    return game.players.findIndex(player =>
        player.hand.some(card =>
            card.rank === "3" && card.suit === "D"
        )
    );
}

/* =========================================================
   Card combination analysis
========================================================= */

function createRankGroups(cards) {
    const rankMap = new Map();

    for (const card of cards) {
        if (!rankMap.has(card.rankPower)) {
            rankMap.set(card.rankPower, []);
        }

        rankMap.get(card.rankPower).push(card);
    }

    return [...rankMap.entries()].map(
        ([rank, groupedCards]) => ({
            rank,
            cards: groupedCards,
            count: groupedCards.length
        })
    );
}

/*
    Legal straights:
    3-4-5-6-7 through 10-J-Q-K-A.
    A-2-3-4-5 is the largest.

    J-Q-K-A-2, Q-K-A-2-3 and K-A-3-4-5
    are not accepted.
*/
function getStraightInformation(cards) {
    if (cards.length !== 5) {
        return null;
    }

    const uniqueRanks = [
        ...new Set(cards.map(card => card.rankPower))
    ].sort((first, second) => first - second);

    if (uniqueRanks.length !== 5) {
        return null;
    }

    for (let startRank = 0; startRank <= 7; startRank++) {
        const expectedRanks = [
            startRank,
            startRank + 1,
            startRank + 2,
            startRank + 3,
            startRank + 4
        ];

        const matches = expectedRanks.every(
            (rank, index) => rank === uniqueRanks[index]
        );

        if (matches) {
            const highestRank = startRank + 4;
            const highestSuit = Math.max(
                ...cards
                    .filter(card => card.rankPower === highestRank)
                    .map(card => card.suitPower)
            );

            return {
                sequencePower: startRank,
                highestSuit
            };
        }
    }

    const aceTwoThreeFourFive = [0, 1, 2, 11, 12];

    const isAceTwoThreeFourFive = aceTwoThreeFourFive.every(
        (rank, index) => rank === uniqueRanks[index]
    );

    if (isAceTwoThreeFourFive) {
        const highestSuit = Math.max(
            ...cards
                .filter(card => card.rankPower === 12)
                .map(card => card.suitPower)
        );

        return {
            sequencePower: 8,
            highestSuit
        };
    }

    return null;
}

function invalidAnalysis(cards) {
    return {
        valid: false,
        count: cards.length,
        type: "invalid",
        key: [],
        cards: [...cards]
    };
}

function analyzeCards(cards) {
    const sortedCards = [...cards].sort(
        (first, second) =>
            first.rankPower - second.rankPower ||
            first.suitPower - second.suitPower
    );

    if (cards.length === 1) {
        const card = cards[0];

        return {
            valid: true,
            count: 1,
            type: "single",
            key: [card.rankPower, card.suitPower],
            cards: sortedCards
        };
    }

    const rankGroups = createRankGroups(cards);

    if (cards.length === 2) {
        if (rankGroups.length !== 1) {
            return invalidAnalysis(cards);
        }

        return {
            valid: true,
            count: 2,
            type: "pair",
            key: [
                cards[0].rankPower,
                Math.max(...cards.map(card => card.suitPower))
            ],
            cards: sortedCards
        };
    }

    if (cards.length === 3) {
        if (rankGroups.length !== 1) {
            return invalidAnalysis(cards);
        }

        return {
            valid: true,
            count: 3,
            type: "triple",
            key: [cards[0].rankPower],
            cards: sortedCards
        };
    }

    if (cards.length !== 5) {
        return invalidAnalysis(cards);
    }

    const isFlush = cards.every(
        card => card.suit === cards[0].suit
    );

    const straightInformation = getStraightInformation(cards);

    if (isFlush && straightInformation) {
        return {
            valid: true,
            count: 5,
            type: "straightFlush",
            key: [
                FIVE_CARD_POWER.straightFlush,
                straightInformation.sequencePower,
                straightInformation.highestSuit
            ],
            cards: sortedCards
        };
    }

    const fourCardGroup = rankGroups.find(
        group => group.count === 4
    );

    if (fourCardGroup) {
        return {
            valid: true,
            count: 5,
            type: "fourKind",
            key: [
                FIVE_CARD_POWER.fourKind,
                fourCardGroup.rank
            ],
            cards: sortedCards
        };
    }

    const threeCardGroup = rankGroups.find(
        group => group.count === 3
    );

    const pairGroup = rankGroups.find(
        group => group.count === 2
    );

    if (threeCardGroup && pairGroup) {
        return {
            valid: true,
            count: 5,
            type: "fullHouse",
            key: [
                FIVE_CARD_POWER.fullHouse,
                threeCardGroup.rank
            ],
            cards: sortedCards
        };
    }

    if (isFlush) {
        const descendingRanks = [...cards]
            .sort((first, second) =>
                second.rankPower - first.rankPower ||
                second.suitPower - first.suitPower
            )
            .map(card => card.rankPower);

        return {
            valid: true,
            count: 5,
            type: "flush",
            key: [
                FIVE_CARD_POWER.flush,
                ...descendingRanks,
                cards[0].suitPower
            ],
            cards: sortedCards
        };
    }

    if (straightInformation) {
        return {
            valid: true,
            count: 5,
            type: "straight",
            key: [
                FIVE_CARD_POWER.straight,
                straightInformation.sequencePower,
                straightInformation.highestSuit
            ],
            cards: sortedCards
        };
    }

    return invalidAnalysis(cards);
}

function compareKeys(firstKey, secondKey) {
    const comparisonLength = Math.max(
        firstKey.length,
        secondKey.length
    );

    for (let index = 0; index < comparisonLength; index++) {
        const firstValue = firstKey[index] ?? 0;
        const secondValue = secondKey[index] ?? 0;

        if (firstValue !== secondValue) {
            return firstValue - secondValue;
        }
    }

    return 0;
}

function combinationBeats(candidate, previous) {
    return (
        candidate.valid &&
        previous?.valid &&
        candidate.count === previous.count &&
        compareKeys(candidate.key, previous.key) > 0
    );
}

function containsDiamondThree(cards) {
    return cards.some(card =>
        card.rank === "3" && card.suit === "D"
    );
}

function isFreeLead(playerIndex) {
    return (
        game.lastPlay === null ||
        game.lastPlayer === playerIndex
    );
}

/* =========================================================
   Generate card combinations
========================================================= */

function generateCombinations(array, requiredSize) {
    const result = [];

    function walk(startIndex, selectedItems) {
        if (selectedItems.length === requiredSize) {
            result.push([...selectedItems]);
            return;
        }

        const itemsStillNeeded =
            requiredSize - selectedItems.length;

        for (
            let index = startIndex;
            index <= array.length - itemsStillNeeded;
            index++
        ) {
            selectedItems.push(array[index]);
            walk(index + 1, selectedItems);
            selectedItems.pop();
        }
    }

    walk(0, []);

    return result;
}

/* =========================================================
   Legal play generation
========================================================= */

function getLegalPlays(playerIndex, ignoreTopCardRule = false) {
    const player = game.players[playerIndex];

    if (!player) {
        return [];
    }

    const requiredSizes = isFreeLead(playerIndex)
        ? [1, 2, 3, 5]
        : [game.lastPlay.count];

    const legalPlays = [];

    for (const requiredSize of requiredSizes) {
        if (player.hand.length < requiredSize) {
            continue;
        }

        const possibleCombinations = generateCombinations(
            player.hand,
            requiredSize
        );

        for (const cards of possibleCombinations) {
            const analysis = analyzeCards(cards);

            if (!analysis.valid) {
                continue;
            }

            if (
                game.round === 1 &&
                game.firstTurn &&
                !containsDiamondThree(cards)
            ) {
                continue;
            }

            if (
                !isFreeLead(playerIndex) &&
                !combinationBeats(analysis, game.lastPlay)
            ) {
                continue;
            }

            legalPlays.push({ cards, analysis });
        }
    }

    legalPlays.sort((first, second) =>
        first.analysis.count - second.analysis.count ||
        compareKeys(first.analysis.key, second.analysis.key)
    );

    /*
        If the next player has one card, the original logic
        prioritizes the strongest legal single.
    */
    if (
        !ignoreTopCardRule &&
        playerHandCount(nextSeat(playerIndex)) === 1
    ) {
        const legalSingles = legalPlays.filter(
            play => play.analysis.count === 1
        );

        if (legalSingles.length) {
            return [legalSingles[legalSingles.length - 1]];
        }
    }

    return legalPlays;
}

/* =========================================================
   Strict play validation
========================================================= */

function checkPlay(playerIndex, cards) {
    if (!cards.length) {
        return {
            ok: false,
            reason: "請先選擇要出的牌。"
        };
    }

    // Following plays must have the same card count.
    if (
        !isFreeLead(playerIndex) &&
        game.lastPlay &&
        cards.length !== game.lastPlay.count
    ) {
        return {
            ok: false,
            reason:
                `上一手出了 ${game.lastPlay.count} 張牌，` +
                `你必須出 ${game.lastPlay.count} 張牌，` +
                "或選擇 PASS。"
        };
    }

    const analysis = analyzeCards(cards);

    if (!analysis.valid) {
        return {
            ok: false,
            reason: "這不是合法牌型。",
            analysis
        };
    }

    if (
        game.round === 1 &&
        game.firstTurn &&
        !containsDiamondThree(cards)
    ) {
        return {
            ok: false,
            reason: "第一局首次出牌必須包括方塊 3。",
            analysis
        };
    }

    if (
        !isFreeLead(playerIndex) &&
        !combinationBeats(analysis, game.lastPlay)
    ) {
        return {
            ok: false,
            reason: "所出的牌不大於上一手。",
            analysis
        };
    }

    // Top-card rule.
    if (
        playerHandCount(nextSeat(playerIndex)) === 1 &&
        analysis.count === 1
    ) {
        const legalSingles = getLegalPlays(
            playerIndex,
            true
        ).filter(play => play.analysis.count === 1);

        if (legalSingles.length) {
            legalSingles.sort((first, second) =>
                compareKeys(
                    first.analysis.key,
                    second.analysis.key
                )
            );

            const strongestSingle =
                legalSingles[legalSingles.length - 1];

            if (
                compareKeys(
                    analysis.key,
                    strongestSingle.analysis.key
                ) < 0
            ) {
                return {
                    ok: false,
                    reason:
                        "下家只剩一張牌，" +
                        "你必須打出最大的合法單張。",
                    analysis
                };
            }
        }
    }

    return {
        ok: true,
        reason: "",
        analysis
    };
}

/* =========================================================
   Verified Dee rule
========================================================= */

/*
    Dee:
    - Exactly two cards among J, Q and K.
    - No Ace.
    - No 2.
    - The hand contains 13 cards.
*/
function handQualifiesForDee(hand) {
    if (!Array.isArray(hand) || hand.length !== 13) {
        return false;
    }

    const courtCardCount = hand.filter(card =>
        card.rank === "J" ||
        card.rank === "Q" ||
        card.rank === "K"
    ).length;

    const containsAceOrTwo = hand.some(card =>
        card.rank === "A" || card.rank === "2"
    );

    return courtCardCount === 2 && !containsAceOrTwo;
}

function verifyDeeRequest(playerIndex) {
    if (!network.started || game.roundOver) {
        return {
            valid: false,
            reason: "現在不能申請 Dee。"
        };
    }

    if (!game.firstTurn || game.lastPlay !== null) {
        return {
            valid: false,
            reason: "Dee 只可以在本局第一次出牌前申請。"
        };
    }

    const player = game.players[playerIndex];

    if (!player || !Array.isArray(player.hand)) {
        return {
            valid: false,
            reason: "無法驗證玩家的手牌。"
        };
    }

    if (!handQualifiesForDee(player.hand)) {
        return {
            valid: false,
            reason:
                "不符合「雙公無煙 Dee」：" +
                "必須剛好有兩張 J／Q／K，" +
                "而且沒有 A 或 2。"
        };
    }

    return {
        valid: true,
        reason: ""
    };
}

function approveDee(playerIndex) {
    const verification = verifyDeeRequest(playerIndex);

    if (!verification.valid) {
        return verification;
    }

    const playerName = game.players[playerIndex].name;

    setMessage(
        `${playerName}的手牌已確認符合` +
        "「雙公無煙 Dee」，正在重新派牌。",
        "notice"
    );

    startRound(true);

    return {
        valid: true,
        reason: ""
    };
}

function requestDee() {
    const localSeat = network.localSeat;

    if (!network.started || game.roundOver) {
        setMessage("現在不能申請 Dee。", "bad");
        return;
    }

    if (network.isHost) {
        const result = approveDee(localSeat);

        if (!result.valid) {
            setMessage(result.reason, "bad");
        }

        return;
    }

    if (
        !network.hostConnection ||
        !network.hostConnection.open
    ) {
        setMessage(
            "無法連接房主，不能申請 Dee。",
            "bad"
        );
        return;
    }

    network.hostConnection.send({
        type: "action",
        action: "dee"
    });

    setMessage("已向房主申請驗證 Dee。", "notice");
}

/* =========================================================
   Start a round
========================================================= */

function startRound(isRedeal = false) {
    if (!network.isHost) {
        return;
    }

    clearTurnTimers();

    game.roundOver = false;
    game.firstTurn = true;
    game.lastPlay = null;
    game.lastPlayer = null;
    game.passCount = 0;
    game.selected.clear();

    if (game.round === 1 || game.dealer === null) {
        game.dealer = secureRandomInteger(4);
        game.direction = 1;
        game.dealDirection = -1;
    } else if (!isRedeal) {
        game.dealer = game.winner;
        game.direction *= -1;
        game.dealDirection *= -1;
    }

    game.players = network.seats.map((seat, index) => ({
        name: seat.name,
        bot: seat.bot,
        hand: [],
        penalty: [],
        handCount: 0,
        index
    }));

    // Shuffle a fresh deck and deal each card exactly once.
    const deck = secureShuffle(createDeck());
    let recipient = game.dealer;

    for (const card of deck) {
        game.players[recipient].hand.push(card);
        recipient = nextSeat(recipient, game.dealDirection);
    }

    for (const player of game.players) {
        sortHand(player.hand);
        player.handCount = player.hand.length;
    }

    game.turn = game.round === 1
        ? findDiamondThreeOwner()
        : game.winner;

    nextButton.classList.add("hidden");

    setMessage(
        game.round === 1
            ? `${game.players[game.turn].name}` +
              "持有方塊 3，必須首先出牌。"
            : `${game.players[game.turn].name}` +
              "是上局勝出者，首先出牌。",
        "notice"
    );

    renderEverything();
    beginTurn();
}

/* =========================================================
   Commit a valid play
========================================================= */

function commitPlay(playerIndex, cards, analysis) {
    if (!network.isHost) {
        return;
    }

    clearTurnTimers();

    const player = game.players[playerIndex];
    const playedCardIDs = new Set(
        cards.map(card => card.id)
    );

    player.hand = player.hand.filter(
        card => !playedCardIDs.has(card.id)
    );

    player.handCount = player.hand.length;

    game.selected.clear();

    game.lastPlay = {
        ...analysis,
        cards: [...cards]
    };

    game.lastPlayer = playerIndex;
    game.passCount = 0;
    game.firstTurn = false;

    let description =
        `${player.name}打出${TYPE_NAMES[analysis.type]}：` +
        cards.map(card => card.symbol + card.rank).join(" ");

    if (player.hand.length === 1) {
        description += " — Last Card！";
    }

    setMessage(
        description,
        player.hand.length === 1 ? "notice" : "good"
    );

    if (player.hand.length === 0) {
        finishRound(playerIndex);
        return;
    }

    game.turn = nextSeat(playerIndex);

    renderEverything();
    beginTurn();
}

/* =========================================================
   Pass
========================================================= */

function commitPass(playerIndex) {
    if (!network.isHost) {
        return;
    }

    clearTurnTimers();

    if (isFreeLead(playerIndex)) {
        sendActionErrorToSeat(
            playerIndex,
            "自由出牌時不能 PASS。"
        );
        return;
    }

    game.passCount++;

    setMessage(
        `${game.players[playerIndex].name}選擇 PASS。`,
        "notice"
    );

    if (game.passCount >= 3) {
        const newLeader = game.lastPlayer;

        game.lastPlay = null;
        game.passCount = 0;
        game.turn = newLeader;

        setMessage(
            "其餘三家全部 PASS，" +
            `${game.players[newLeader].name}可以自由出牌。`,
            "notice"
        );
    } else {
        game.turn = nextSeat(playerIndex);
    }

    renderEverything();
    beginTurn();
}

/* =========================================================
   Finish round
========================================================= */

function finishRound(playerIndex) {
    clearTurnTimers();

    game.roundOver = true;
    game.winner = playerIndex;
    game.wins[playerIndex]++;

    setMessage(
        `🏆 ${game.players[playerIndex].name}` +
        `勝出第 ${game.round} 局！`,
        "good"
    );

    renderEverything();
    synchronizeGameState();
}

/* =========================================================
   Human player actions
========================================================= */

function humanPlay() {
    const localSeat = network.localSeat;
    const localPlayer = game.players[localSeat];

    if (
        game.roundOver ||
        game.turn !== localSeat ||
        !localPlayer ||
        localPlayer.bot
    ) {
        return;
    }

    const selectedCards = localPlayer.hand.filter(
        card => game.selected.has(card.id)
    );

    // Validate locally; the host validates again.
    const check = checkPlay(localSeat, selectedCards);

    if (!check.ok) {
        setMessage(check.reason, "bad");
        return;
    }

    if (!network.isHost) {
        if (
            !network.hostConnection ||
            !network.hostConnection.open
        ) {
            setMessage("與房主的連線已中斷。", "bad");
            return;
        }

        network.hostConnection.send({
            type: "action",
            action: "play",
            cardIds: selectedCards.map(card => card.id)
        });

        setMessage("等待房主確認出牌……", "notice");
        return;
    }

    commitPlay(localSeat, selectedCards, check.analysis);
}

function humanPass() {
    const localSeat = network.localSeat;
    const localPlayer = game.players[localSeat];

    if (
        game.roundOver ||
        game.turn !== localSeat ||
        !localPlayer ||
        localPlayer.bot
    ) {
        return;
    }

    if (isFreeLead(localSeat)) {
        setMessage("自由出牌時不能 PASS。", "bad");
        return;
    }

    if (network.isHost) {
        commitPass(localSeat);
    } else {
        network.hostConnection.send({
            type: "action",
            action: "pass"
        });
    }
}

function showHint() {
    const localSeat = network.localSeat;
    const localPlayer = game.players[localSeat];

    if (
        game.roundOver ||
        game.turn !== localSeat ||
        !localPlayer ||
        localPlayer.bot
    ) {
        return;
    }

    const legalPlays = getLegalPlays(localSeat);
    game.selected.clear();

    if (!legalPlays.length) {
        setMessage("沒有可以出的牌，請 PASS。", "notice");
        renderLocalHand();
        return;
    }

    for (const card of legalPlays[0].cards) {
        game.selected.add(card.id);
    }

    setMessage(
        "提示：可出" +
        TYPE_NAMES[legalPlays[0].analysis.type] +
        "。",
        "good"
    );

    renderLocalHand();
}

/* =========================================================
   Authoritative remote action validation
========================================================= */

function sendActionError(connection, message) {
    if (connection?.open) {
        connection.send({
            type: "actionError",
            message
        });
    }
}

function sendActionErrorToSeat(playerIndex, message) {
    if (playerIndex === network.localSeat) {
        setMessage(message, "bad");
        return;
    }

    const connection = network.connections.get(playerIndex);
    sendActionError(connection, message);
}

function handleRemoteAction(connection, data) {
    const playerIndex = connection.playerSeat;

    if (
        playerIndex === undefined ||
        !game.players[playerIndex] ||
        game.players[playerIndex].bot
    ) {
        return;
    }

    // Dee can be requested before the first play, out of turn.
    if (data.action === "dee") {
        const result = approveDee(playerIndex);

        if (!result.valid) {
            sendActionError(connection, result.reason);
        }

        return;
    }

    if (game.roundOver || game.turn !== playerIndex) {
        sendActionError(connection, "現在不是你的回合。");
        return;
    }

    if (data.action === "pass") {
        if (isFreeLead(playerIndex)) {
            sendActionError(
                connection,
                "自由出牌時不能 PASS。"
            );
            return;
        }

        commitPass(playerIndex);
        return;
    }

    if (data.action !== "play") {
        return;
    }

    const requestedIDs = Array.isArray(data.cardIds)
        ? data.cardIds
        : [];

    const uniqueIDs = new Set(requestedIDs);

    if (
        requestedIDs.length === 0 ||
        requestedIDs.length !== uniqueIDs.size
    ) {
        sendActionError(connection, "出牌資料無效。");
        return;
    }

    // Use the host's authoritative hand, not client card data.
    const selectedCards = game.players[playerIndex].hand.filter(
        card => uniqueIDs.has(card.id)
    );

    if (selectedCards.length !== uniqueIDs.size) {
        sendActionError(
            connection,
            "所選啤牌不屬於你的手牌。"
        );
        return;
    }

    const check = checkPlay(playerIndex, selectedCards);

    if (!check.ok) {
        sendActionError(connection, check.reason);
        return;
    }

    commitPlay(playerIndex, selectedCards, check.analysis);
}

/* =========================================================
   Bot AI
========================================================= */

function chooseBotPlay(playerIndex) {
    const legalPlays = getLegalPlays(playerIndex);

    if (!legalPlays.length) {
        return null;
    }

    const player = game.players[playerIndex];

    const winningPlay = legalPlays.find(
        play => play.cards.length === player.hand.length
    );

    if (winningPlay) {
        return winningPlay;
    }

    if (playerHandCount(nextSeat(playerIndex)) === 1) {
        const legalSingles = legalPlays.filter(
            play => play.cards.length === 1
        );

        if (legalSingles.length) {
            return legalSingles[legalSingles.length - 1];
        }
    }

    if (isFreeLead(playerIndex)) {
        for (const preferredSize of [5, 3, 2, 1]) {
            const preferredPlay = legalPlays.find(
                play => play.cards.length === preferredSize
            );

            if (preferredPlay) {
                return preferredPlay;
            }
        }
    }

    return legalPlays[0];
}

function runBotTurn() {
    if (
        !network.isHost ||
        game.roundOver ||
        !game.players[game.turn]?.bot
    ) {
        return;
    }

    const botSeat = game.turn;
    const chosenPlay = chooseBotPlay(botSeat);

    game.aiTimer = window.setTimeout(() => {
        if (
            game.roundOver ||
            game.turn !== botSeat ||
            !game.players[botSeat]?.bot
        ) {
            return;
        }

        if (chosenPlay) {
            commitPlay(
                botSeat,
                chosenPlay.cards,
                chosenPlay.analysis
            );
        } else {
            commitPass(botSeat);
        }
    }, 700 + secureRandomInteger(901));
}

/* =========================================================
   Turn timer
========================================================= */

function beginTurn() {
    if (game.roundOver) {
        return;
    }

    renderEverything();

    // Only the host controls the timer.
    if (!network.isHost) {
        return;
    }

    clearTurnTimers();

    game.timeLeft = 30;

    updateTimer();
    synchronizeGameState();

    game.timerId = window.setInterval(() => {
        game.timeLeft--;

        updateTimer();
        synchronizeGameState();

        if (game.timeLeft <= 0) {
            clearTurnTimers();
            handleTimeout();
        }
    }, 1000);

    if (game.players[game.turn].bot) {
        runBotTurn();
    }
}

function handleTimeout() {
    const playerIndex = game.turn;

    if (isFreeLead(playerIndex)) {
        const legalPlays = getLegalPlays(playerIndex);

        if (legalPlays.length) {
            setMessage(
                `${game.players[playerIndex].name}逾時，自動出牌。`,
                "bad"
            );

            commitPlay(
                playerIndex,
                legalPlays[0].cards,
                legalPlays[0].analysis
            );
        }

        return;
    }

    setMessage(
        `${game.players[playerIndex].name}逾時，自動 PASS。`,
        "bad"
    );

    commitPass(playerIndex);
}

function updateTimer() {
    timerElement.textContent = game.timeLeft;

    timerElement.classList.toggle(
        "warning",
        game.timeLeft <= 10
    );

    timerElement.classList.toggle(
        "danger",
        game.timeLeft <= 5
    );
}

/* =========================================================
   Network state synchronization
========================================================= */

function createStateForSeat(playerSeat) {
    return {
        round: game.round,
        dealer: game.dealer,
        winner: game.winner,
        turn: game.turn,
        direction: game.direction,
        dealDirection: game.dealDirection,
        firstTurn: game.firstTurn,
        roundOver: game.roundOver,
        lastPlay: game.lastPlay,
        lastPlayer: game.lastPlayer,
        passCount: game.passCount,
        timeLeft: game.timeLeft,
        wins: [...game.wins],
        statusText: game.statusText,
        statusType: game.statusType,

        players: game.players.map((player, index) => ({
            name: player.name,
            bot: player.bot,
            index,

            // Send each guest only their own actual cards.
            hand: index === playerSeat ? player.hand : [],
            penalty: index === playerSeat ? player.penalty : [],

            handCount: player.hand.length,
            penaltyCount: player.penalty.length
        }))
    };
}

function synchronizeGameState() {
    if (!network.isHost || !network.started) {
        return;
    }

    for (const [playerSeat, connection] of network.connections) {
        if (connection.open) {
            connection.send({
                type: "state",
                state: createStateForSeat(playerSeat)
            });
        }
    }
}

function applyNetworkState(state) {
    if (network.isHost) {
        return;
    }

    game.round = state.round;
    game.dealer = state.dealer;
    game.winner = state.winner;
    game.turn = state.turn;
    game.direction = state.direction;
    game.dealDirection = state.dealDirection;
    game.firstTurn = state.firstTurn;
    game.roundOver = state.roundOver;
    game.lastPlay = state.lastPlay;
    game.lastPlayer = state.lastPlayer;
    game.passCount = state.passCount;
    game.timeLeft = state.timeLeft;
    game.wins = state.wins;
    game.statusText = state.statusText;
    game.statusType = state.statusType;
    game.players = state.players;

    const currentHandIDs = new Set(
        game.players[network.localSeat].hand.map(card => card.id)
    );

    game.selected = new Set(
        [...game.selected].filter(
            cardID => currentHandIDs.has(cardID)
        )
    );

    messageElement.textContent = game.statusText;
    messageElement.className = game.statusType;

    updateTimer();
    renderEverything();
}

/* =========================================================
   Rendering cards
========================================================= */

function cardHTML(card, extraClass = "") {
    return `
        <div class="card ${card.red ? "red" : ""} ${extraClass}">
            <div class="card-corner">
                ${card.rank}<br>
                ${card.symbol}
            </div>

            <div class="card-symbol">
                ${card.symbol}
            </div>

            <div class="card-corner bottom">
                ${card.rank}<br>
                ${card.symbol}
            </div>
        </div>
    `;
}

function renderLocalHand() {
    handElement.innerHTML = "";

    const localPlayer = game.players[network.localSeat];

    if (!localPlayer) {
        return;
    }

    localPlayer.hand.forEach((card, index) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = cardHTML(
            card,
            "hand-card " +
            (game.selected.has(card.id) ? "selected" : "")
        );

        const cardElement = wrapper.firstElementChild;
        cardElement.style.zIndex = index;

        cardElement.addEventListener("click", () => {
            if (
                game.roundOver ||
                game.turn !== network.localSeat ||
                localPlayer.bot
            ) {
                return;
            }

            if (game.selected.has(card.id)) {
                game.selected.delete(card.id);
            } else {
                game.selected.add(card.id);
            }

            renderLocalHand();
        });

        handElement.appendChild(cardElement);
    });
}

/* =========================================================
   Rendering players
========================================================= */

function renderPlayers() {
    if (!game.players.length) {
        return;
    }

    for (
        let visualPosition = 0;
        visualPosition < 4;
        visualPosition++
    ) {
        const actualSeat =
            (network.localSeat + visualPosition) % 4;

        const player = game.players[actualSeat];
        const playerZone = element("player" + visualPosition);
        const cardCount = playerHandCount(actualSeat);

        playerZone.classList.toggle(
            "active",
            game.turn === actualSeat && !game.roundOver
        );

        playerZone.classList.toggle(
            "winner",
            game.roundOver && game.winner === actualSeat
        );

        const cardBacks = visualPosition === 0
            ? ""
            : `
                <div class="mini-hand">
                    ${
                        Array.from(
                            { length: Math.min(cardCount, 10) },
                            () => '<div class="mini-card"></div>'
                        ).join("")
                    }
                </div>
            `;

        const penaltyCount =
            player.penaltyCount ?? player.penalty.length;

        playerZone.innerHTML = `
            ${cardBacks}

            <div class="player-panel">
                <div class="avatar">
                    ${
                        player.bot
                            ? "🤖"
                            : (PLAYER_ICONS[actualSeat] || "😎")
                    }
                </div>

                <div class="player-name">
                    ${safeHTML(player.name)}
                    ${game.dealer === actualSeat ? " 🎴" : ""}
                </div>

                <div class="player-meta">
                    ${cardCount} 張牌
                    ${cardCount === 1 ? "｜⚠ Last Card" : ""}
                    ${penaltyCount > 0 ? "｜扣牌 " + penaltyCount : ""}
                    ｜勝 ${game.wins[actualSeat]}
                </div>
            </div>
        `;
    }
}

/* =========================================================
   Rendering table
========================================================= */

function renderTable() {
    tableCardsElement.innerHTML = "";

    if (!game.lastPlay) {
        trickLabelElement.textContent = game.roundOver
            ? "本局完結"
            : "自由出牌";

        return;
    }

    let label =
        `${game.players[game.lastPlayer].name}：` +
        TYPE_NAMES[game.lastPlay.type];

    if (
        !game.roundOver &&
        !isFreeLead(network.localSeat)
    ) {
        label += `｜必須跟 ${game.lastPlay.count} 張`;
    }

    trickLabelElement.textContent = label;

    for (const card of game.lastPlay.cards) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = cardHTML(card, "table-card");

        tableCardsElement.appendChild(
            wrapper.firstElementChild
        );
    }
}

/* =========================================================
   Rendering controls
========================================================= */

function renderControls() {
    const localSeat = network.localSeat;
    const localPlayer = game.players[localSeat];

    const isLocalTurn =
        Boolean(localPlayer) &&
        !localPlayer.bot &&
        game.turn === localSeat &&
        !game.roundOver;

    playButton.disabled = !isLocalTurn;
    hintButton.disabled = !isLocalTurn;
    clearButton.disabled = !isLocalTurn;

    passButton.disabled =
        !isLocalTurn || isFreeLead(localSeat);

    const deePeriodIsOpen =
        network.started &&
        !game.roundOver &&
        game.firstTurn &&
        game.lastPlay === null &&
        localPlayer &&
        !localPlayer.bot;

    deeButton.classList.toggle(
        "hidden",
        !deePeriodIsOpen
    );

    nextButton.classList.toggle(
        "hidden",
        !network.isHost || !game.roundOver
    );
}

/* =========================================================
   Rendering penalty information
========================================================= */

function renderPenaltyInformation() {
    const localPlayer = game.players[network.localSeat];

    if (!localPlayer || !localPlayer.penalty.length) {
        penaltyElement.classList.add("hidden");
        return;
    }

    penaltyElement.classList.remove("hidden");

    penaltyElement.textContent =
        "被扣起的非法牌：" +
        localPlayer.penalty
            .map(card => card.symbol + card.rank)
            .join(" ");
}

/* =========================================================
   Rendering game information
========================================================= */

function renderGameInformation() {
    const playDirection =
        game.direction === 1 ? "順時針" : "逆時針";

    const dealingDirection =
        game.dealDirection === 1 ? "順時針" : "逆時針";

    gameInfoElement.innerHTML =
        `房間 ${network.roomCode}｜` +
        (network.isHost ? "房主" : "網上玩家") +
        "<br>" +
        `第 ${game.round} 局｜` +
        `派牌 ${dealingDirection}｜` +
        `出牌 ${playDirection}`;
}

function renderEverything() {
    renderPlayers();
    renderLocalHand();
    renderTable();
    renderControls();
    renderPenaltyInformation();
    renderGameInformation();
    updateTimer();
}

function setMessage(text, type = "notice") {
    game.statusText = text;
    game.statusType = type;

    messageElement.textContent = text;
    messageElement.className = type;
}

/* =========================================================
   Event listeners
========================================================= */

createButton.addEventListener("click", createRoom);
joinButton.addEventListener("click", joinRoom);
startButton.addEventListener("click", startOnlineGame);

copyButton.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(network.roomCode);

        copyButton.textContent = "已複製";

        window.setTimeout(() => {
            copyButton.textContent = "複製";
        }, 1200);
    } catch {
        window.prompt("複製房間代碼：", network.roomCode);
    }
});

codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
});

codeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        joinRoom();
    }
});

playButton.addEventListener("click", humanPlay);
passButton.addEventListener("click", humanPass);
hintButton.addEventListener("click", showHint);

clearButton.addEventListener("click", () => {
    game.selected.clear();
    renderLocalHand();
});

deeButton.addEventListener("click", requestDee);

nextButton.addEventListener("click", () => {
    if (!network.isHost || !game.roundOver) {
        return;
    }

    game.round++;
    startRound(false);
});

element("rulesButton").addEventListener("click", () => {
    element("rulesModal").classList.add("open");
});

element("closeRules").addEventListener("click", () => {
    element("rulesModal").classList.remove("open");
});

element("rulesModal").addEventListener("click", event => {
    if (event.target === element("rulesModal")) {
        element("rulesModal").classList.remove("open");
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        element("rulesModal").classList.remove("open");

        game.selected.clear();
        renderLocalHand();
    }

    if (
        event.key === "Enter" &&
        menuElement.classList.contains("hidden")
    ) {
        humanPlay();
    }

    if (
        event.code === "Space" &&
        menuElement.classList.contains("hidden")
    ) {
        event.preventDefault();
        humanPass();
    }
});

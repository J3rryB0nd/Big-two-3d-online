# Big Two 3D Online (鋤大D 3D Online)

A browser-based online multiplayer version of **Big Two**, the Hong Kong-style card game known as 鋤大D. Create a room, share the 6-character code with friends, and play together. Computer players fill any empty seats.

> 網上版鋤大D：建立房間後，朋友可用 6 位代碼加入，空位會由電腦玩家自動補上。

🎮 **Live demo:** https://bigtwo3donline.vercel.app

## Features

- **Online multiplayer for up to 4 players.** Peer-to-peer rooms built on [PeerJS](https://peerjs.com/), so no custom server is needed. (最多 4 人網上對戰，無需自設伺服器。)
- **Room codes.** The host gets a random 6-character code, and friends join by entering it. (房主建立房間後會得到 6 位房間代碼。)
- **Computer players.** Empty seats are filled automatically when the host starts the game. (開始遊戲時，空位由電腦補滿。)
- **Bot takeover.** If a player disconnects mid-game, a computer player takes over their seat. (玩家中途離線，由電腦接管。)
- **Full rule validation.** Illegal card counts or combinations are rejected, and the cards stay in your hand. (錯誤牌數或非法牌型會被拒絕，牌不會離開手牌。)
- **Turn timer.** Each turn is limited to 30 seconds. (每回合限時 30 秒。)
- **Helpers.** Hint, clear-selection, and in-game rules buttons. A "Last Card" warning appears when a player has one card left. (提示、取消選牌、規則說明；剩一張牌時顯示 Last Card。)
- **Fair shuffling.** Uses `crypto.getRandomValues` with rejection sampling and a Fisher-Yates shuffle. (使用安全隨機數洗牌。)
- **Traditional Chinese interface** (`zh-HK`). (介面為繁體中文。)

## How to Play

1. Enter your player name (玩家名稱).
2. Click **Create Room** (建立房間) to host, or enter a friend's 6-character code and click **Join Room** (加入房間).
3. The host clicks **Start Game** (開始遊戲). Empty seats are filled by computer players.
4. Select cards from your hand, then click **Play** (出牌) or **PASS**.

## Game Rules (遊戲規則)

### Card order (牌的大小)

- **Rank:** 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 (點數)
- **Suit:** ♠ Spades > ♥ Hearts > ♣ Clubs > ♦ Diamonds (花色：黑桃 > 紅心 > 梅花 > 方塊)

### Combinations (牌型)

| English | 中文 | Description |
|---|---|---|
| Single | 單張 | One card |
| Pair | 一對 | Two cards of the same rank |
| Triple | 三條 | Three cards of the same rank |
| Straight | 蛇 | Five cards in sequence |
| Flush | 花 | Five cards of the same suit |
| Full House | 俘虜 | Three of a kind plus a pair |
| Four of a Kind | 四條 | Four cards of the same rank plus one card |
| Straight Flush | 同花順 | Five sequential cards of the same suit |

Five-card hands rank as: Straight < Flush < Full House < Four of a Kind < Straight Flush.

**Straight rules (蛇的規則):** A-2-3-4-5 is the highest straight. J-Q-K-A-2, Q-K-A-2-3 and K-A-3-4-5 are not accepted.

### Following rules (跟牌規則)

You must play the same number of cards as the previous hand and beat it, or pass. After a single, a pair, a triple, or a five-card hand, the next player must play the same type of count or PASS. (上一手出幾多張，下一位就只能出同樣張數或 PASS。)

### Game flow (遊戲流程)

- In the first round, the player holding the ♦3 starts, and the first play must include it. (第一局由持有方塊 3 的玩家開始。)
- In later rounds, the previous round's winner starts. (之後由上一局勝出者開始。)
- If the other three players pass, the last player to play can lead any combination. (其餘三家 PASS 後，最後出牌者可自由出牌。)
- The host handles shuffling, dealing, the timer, rule validation and the computer players. (房主負責洗牌、派牌、計時、規則驗證及電腦玩家。)

### Dee (雙公無煙)

In this version, a player can claim **Dee** if their hand has exactly two J/Q/K cards and no A or 2. The claim must be made before the player's first play of the round. The host checks it against the real hand data, and players cannot confirm it themselves. (手牌剛好只有兩張 J／Q／K，而且沒有 A 或 2，只可在第一次出牌前申請，並由房主驗證。)

## Tech Stack

- HTML, CSS, and vanilla JavaScript (no build step)
- [PeerJS](https://peerjs.com/) 1.5.5 for WebRTC networking
- Deployed on [Vercel](https://vercel.com/)

## Project Structure

```
├── index.html   # Menu, lobby, game table, rules modal
├── script.js    # Game logic, networking, bots, validation
├── style.css    # Styling
└── LICENSE      # MIT License
```

## Run Locally

```bash
git clone https://github.com/J3rryB0nd/Big-two-3d-online.git
cd Big-two-3d-online
# Open index.html in a browser, or serve it locally:
npx serve .
```

An internet connection is required because PeerJS is loaded from a CDN.

## Architecture

The **host** is authoritative. The host's browser shuffles and deals the cards, runs the timer, validates every move, and controls the computer players. Guests send their actions to the host and receive the updated game state. (房主為權威端：所有出牌都由房主驗證，玩家只負責發送操作及接收最新狀態。)

## Credits

Built with the assistance of GPT-5.6 Sol and GPT-6.1 Sol.

## License

This project is licensed under the [MIT License](LICENSE). (本項目以 MIT 授權條款發佈。)

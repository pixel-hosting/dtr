const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.post("/moderation", async (req, res) => {
  const { action, userId, reason, duration } = req.body;

  try {
    await axios.post(
      `https://apis.roblox.com/messaging-service/v1/universes/${process.env.UNIVERSE_ID}/topics/DTRModerationCommand`,
      {
        message: JSON.stringify({ action, userId, reason, duration })
      },
      {
        headers: {
          "x-api-key": process.env.API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).send("Command sent to all servers!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to send command.");
  }
});

app.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));

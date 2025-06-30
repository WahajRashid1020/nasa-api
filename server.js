const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const NASA_API_KEY = process.env.NASA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.use(cors());
app.use(express.json());

const handleApiError = (res, message, error) => {
  console.error(message, error?.response?.data || error.message);
  res.status(error?.response?.status || 500).json({ error: message });
};

const ensureApiKey = (res, key, service = "API") => {
  if (!key) {
    res.status(500).json({ error: `${service} key is missing` });
    return false;
  }
  return true;
};

app.get("/api/apod", async (req, res) => {
  if (!ensureApiKey(res, NASA_API_KEY, "NASA")) return;
  const date = req.query.date || "";

  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}${
      date ? `&date=${date}` : ""
    }`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (error) {
    handleApiError(res, "Failed to fetch APOD data", error);
  }
});

app.get("/api/launches", async (req, res) => {
  try {
    const { data } = await axios.get("https://api.spacexdata.com/v3/launches");

    if (!Array.isArray(data)) throw new Error("Unexpected launch data format");

    const filtered = req.query.mission_name
      ? data.filter((launch) =>
          launch.mission_name
            .toLowerCase()
            .includes(req.query.mission_name.toLowerCase())
        )
      : data;

    res.json(filtered);
  } catch (error) {
    handleApiError(res, "Failed to fetch SpaceX launch data", error);
  }
});

app.get("/api/rockets", async (_req, res) => {
  try {
    const { data } = await axios.get("https://api.spacexdata.com/v4/rockets");
    res.json(data);
  } catch (error) {
    handleApiError(res, "Failed to fetch rockets", error);
  }
});

app.get("/api/nasa-images", async (req, res) => {
  try {
    const { q = "mars", media_type = "image" } = req.query;

    const validMediaTypes = ["image", "video", "audio"];
    if (!validMediaTypes.includes(media_type)) {
      return res.status(400).json({ error: "Invalid media_type specified." });
    }

    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(
      q
    )}&media_type=${media_type}`;

    const response = await axios.get(url);
    const items = response?.data?.collection?.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(404)
        .json({ error: "No media found for the given query." });
    }

    const result = items.slice(0, 6).map((item) => {
      const data = item.data?.[0] || {};
      const link = item.links?.[0];

      return {
        nasa_id: data.nasa_id,
        title: data.title || "Untitled",
        description: data.description || "No description provided.",
        date_created: data.date_created || "N/A",
        thumbnail: link?.href || null,
        media_type: data.media_type || media_type,
        href: item.href || null,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Error fetching NASA media:", error?.message || error);
    res.status(500).json({ error: "Failed to fetch NASA media" });
  }
});

app.get("/api/epic", async (req, res) => {
  if (!ensureApiKey(res, NASA_API_KEY, "NASA")) return;

  try {
    const date = req.query.date;
    const endpoint = date
      ? `https://api.nasa.gov/EPIC/api/natural/date/${date}`
      : `https://api.nasa.gov/EPIC/api/natural/images`;

    const { data } = await axios.get(`${endpoint}?api_key=${NASA_API_KEY}`);

    const formatted = data.map((item) => {
      const dateStr = item.date.split(" ")[0].replace(/-/g, "/");
      return {
        identifier: item.identifier,
        caption: item.caption,
        date: item.date,
        imageUrl: `https://epic.gsfc.nasa.gov/archive/natural/${dateStr}/png/${item.image}.png`,
        version: item.version,
        sun_j2000_position: item.sun_j2000_position,
        dscovr_j2000_position: item.dscovr_j2000_position,
        attitude_quaternions: item.attitude_quaternions,
        centroid_coordinates: item.centroid_coordinates,
        dscovr_distance: item.dscovr_distance,
        sun_distance: item.sun_distance,
        sun_earth_angle: item.sun_earth_angle,
      };
    });

    res.json(formatted);
  } catch (error) {
    handleApiError(res, "Failed to fetch EPIC images", error);
  }
});

app.post("/api/compare-rockets", async (req, res) => {
  const { rocket1, rocket2 } = req.body;

  if (!rocket1 || !rocket2) {
    return res.status(400).json({ error: "Both rocket names are required." });
  }

  if (!ensureApiKey(res, OPENAI_API_KEY, "OpenAI")) return;

  try {
    const { data } = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant and aerospace expert by nasa. Compare SpaceX and other rockets in plain text.",
          },
          {
            role: "user",
            content: `Compare the following rockets: ${rocket1} vs ${rocket2}`,
          },
        ],
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      comparison: data.choices?.[0]?.message?.content || "No response",
    });
  } catch (error) {
    handleApiError(res, "Failed to generate rocket comparison", error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

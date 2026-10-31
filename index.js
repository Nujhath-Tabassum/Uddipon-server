import express from "express";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URI);

let db;

app.use(cors());
app.use(express.json());

async function connectToMongoDB() {
  try {
    await client.connect();

    db = client.db("uddipon");

    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.post("/api/events", async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      imageUrl,
      location,
      eventDate
    } = req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !eventType ||
      !imageUrl?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).send({
        message: "Please provide all required fields."
      });
    }

    const selectedDate = new Date(`${eventDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate <= today
    ) {
      return res.status(400).send({
        message: "Please select a future date."
      });
    }

    const newEvent = {
      title: title.trim(),
      description: description.trim(),
      eventType,
      imageUrl: imageUrl.trim(),
      location: location.trim(),
      eventDate,
      createdAt: new Date()
    };

    const result = await db.collection("events").insertOne(newEvent);

    res.status(201).send({
      message: "Event created successfully!",
      insertedId: result.insertedId
    });

  } catch (err) {
    console.error("Event creation error:", err);

    res.status(500).send({
      message: "Failed to create event."
    });
  }
});

app.get("/api/events", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const events = await db.collection("events")
      .find({ eventDate: { $gt: today } })
      .sort({ eventDate: 1 })
      .toArray();

    res.status(200).send(events);

  } catch (err) {
    console.error("Error fetching events:", err);

    res.status(500).send({
      message: "Failed to fetch events."
    });
  }
});

async function startServer() {
  await connectToMongoDB();
app.get("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID."
      });
    }

    const event = await db.collection("events").findOne({
      _id: new ObjectId(id)
    });

    if (!event) {
      return res.status(404).send({
        message: "Event not found."
      });
    }

    res.status(200).send(event);

  } catch (err) {
    console.error("Error fetching event:", err);

    res.status(500).send({
      message: "Failed to fetch event."
    });
  }
});

app.patch("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID."
      });
    }

    const {
      title,
      description,
      eventType,
      imageUrl,
      location,
      eventDate
    } = req.body;

    if (
      !title?.trim() ||
      !description?.trim() ||
      !eventType ||
      !imageUrl?.trim() ||
      !location?.trim() ||
      !eventDate
    ) {
      return res.status(400).send({
        message: "Please provide all required fields."
      });
    }

    const selectedDate = new Date(`${eventDate}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate <= today
    ) {
      return res.status(400).send({
        message: "Please select a future date."
      });
    }

    const result = await db.collection("events").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          title: title.trim(),
          description: description.trim(),
          eventType,
          imageUrl: imageUrl.trim(),
          location: location.trim(),
          eventDate
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found."
      });
    }

    res.status(200).send({
      message: "Event updated successfully!"
    });

  } catch (err) {
    console.error("Event update error:", err);

    res.status(500).send({
      message: "Failed to update event."
    });
  }
});


  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();




import express from "express";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

const app = express();

const PORT = process.env.PORT || 8000;

const client = new MongoClient(process.env.MONGODB_URI);

let db;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3001",
  credentials: true
}));

app.use(express.json());

const getTodayDate = () => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka"
  }).format(new Date());
};

const verifyUser = async (req, res, next) => {
  try {
    const cookie = req.headers.cookie;

    if (!cookie) {
      return res.status(401).send({
        message: "Please login first."
      });
    }

    const response = await fetch(
      `${process.env.BETTER_AUTH_URL}/api/auth/get-session`,
      {
        headers: {
          cookie
        }
      }
    );

    if (!response.ok) {
      return res.status(401).send({
        message: "Unauthorized. Please login first."
      });
    }

    const data = await response.json();

    if (!data?.user?.id || !data?.user?.email) {
      return res.status(401).send({
        message: "Unauthorized. Please login first."
      });
    }

    req.user = data.user;

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    res.status(500).send({
      message: "Authentication verification failed."
    });
  }
};

const getOwnerQuery = (user) => {
  return {
    $or: [
      { createdBy: user.email },
      { createdBy: user.id }
    ]
  };
};

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
  res.send({
    message: "Server is running fine!"
  });
});

app.get("/api/events/recent", async (req, res) => {
  try {
    const today = getTodayDate();

    const events = await db.collection("events")
      .find({
        eventDate: { $gte: today }
      })
      .sort({ eventDate: 1 })
      .limit(6)
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    console.error("Recent events error:", error);

    res.status(500).send({
      message: "Failed to fetch recent events."
    });
  }
});

app.post("/api/events", verifyUser, async (req, res) => {
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

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.toISOString().slice(0, 10) !== eventDate ||
      eventDate <= getTodayDate()
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
      createdBy: req.user.email,
      createdById: req.user.id,
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
    const today = getTodayDate();

    const events = await db.collection("events")
      .find({
        eventDate: { $gte: today }
      })
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

app.get("/api/my-events", verifyUser, async (req, res) => {
  try {
    const joinedRecords = await db.collection("joinedEvents")
      .find({
        userEmail: req.user.email
      })
      .toArray();

    const eventIds = joinedRecords.map((record) => record.eventId);

    const events = await db.collection("events")
      .find({
        _id: { $in: eventIds }
      })
      .sort({ eventDate: 1 })
      .toArray();

    res.status(200).send(events);
  } catch (err) {
    console.error("Error fetching joined events:", err);

    res.status(500).send({
      message: "Failed to fetch joined events."
    });
  }
});

app.get("/api/manage-events", verifyUser, async (req, res) => {
  try {
    const events = await db.collection("events")
      .find(getOwnerQuery(req.user))
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(events);
  } catch (err) {
    console.error("Error fetching managed events:", err);

    res.status(500).send({
      message: "Failed to fetch your created events."
    });
  }
});

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

app.post("/api/events/:id/join", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID."
      });
    }

    const event = await db.collection("events").findOne({
      _id: new ObjectId(id),
      eventDate: { $gte: getTodayDate() }
    });

    if (!event) {
      return res.status(404).send({
        message: "Upcoming event not found."
      });
    }

    const existingJoin = await db.collection("joinedEvents").findOne({
      eventId: new ObjectId(id),
      userEmail: req.user.email
    });

    if (existingJoin) {
      return res.status(409).send({
        message: "You have already joined this event."
      });
    }

    await db.collection("joinedEvents").insertOne({
      eventId: new ObjectId(id),
      userId: req.user.id,
      userEmail: req.user.email,
      joinedAt: new Date()
    });

    res.status(201).send({
      message: "You have successfully joined the event!"
    });
  } catch (err) {
    console.error("Event joining error:", err);

    res.status(500).send({
      message: "Failed to join event."
    });
  }
});

app.delete("/api/events/:id/join", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID."
      });
    }

    const result = await db.collection("joinedEvents").deleteOne({
      eventId: new ObjectId(id),
      userEmail: req.user.email
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "You have not joined this event."
      });
    }

    res.status(200).send({
      message: "You have left the event successfully."
    });
  } catch (err) {
    console.error("Event leaving error:", err);

    res.status(500).send({
      message: "Failed to leave event."
    });
  }
});

app.patch("/api/events/:id", verifyUser, async (req, res) => {
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

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.toISOString().slice(0, 10) !== eventDate ||
      eventDate <= getTodayDate()
    ) {
      return res.status(400).send({
        message: "Please select a future date."
      });
    }

    const result = await db.collection("events").updateOne(
      {
        _id: new ObjectId(id),
        ...getOwnerQuery(req.user)
      },
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
        message: "Event not found or you are not authorized to update it."
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

app.delete("/api/events/:id", verifyUser, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID."
      });
    }

    const result = await db.collection("events").deleteOne({
      _id: new ObjectId(id),
      ...getOwnerQuery(req.user)
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not authorized to delete it."
      });
    }

    await db.collection("joinedEvents").deleteMany({
      eventId: new ObjectId(id)
    });

    res.status(200).send({
      message: "Event deleted successfully!"
    });
  } catch (err) {
    console.error("Event deletion error:", err);

    res.status(500).send({
      message: "Failed to delete event."
    });
  }
});

async function startServer() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });
}

startServer();
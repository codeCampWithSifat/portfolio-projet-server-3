const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 4000;
const cors = require("cors");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

// use all the middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7aech.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const userCollection = client.db("PORTFOLIO-SERVER-3").collection("users");
    const blogCollection = client.db("PORTFOLIO-SERVER-3").collection("blogs");
    const amountCollectionDone = client
      .db("PORTFOLIO-SERVER-3")
      .collection("amountsDone");
    const amountCollection = client
      .db("PORTFOLIO-SERVER-3")
      .collection("amounts");
    const donationCollection = client
      .db("PORTFOLIO-SERVER-3")
      .collection("donations");

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // jwt related api
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    // users related  api
    app.post("/users", async (req, res) => {
      const data = req.body;
      const result = await userCollection.insertOne(data);
      res.send(result);
    });

    app.get("/user", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.findOne(query);
      // console.log(result);
      res.send(result);
    });

    app.patch("/user/:id", async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: user.name,
          email: user.email,
          bloodGroup: user.bloodGroup,
          district: user.district,
          upazila: user.upazila,
          avatar: user.avatar,
        },
      };
      // Update the first document that matches the filter
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      // console.log("payments", payment);
      const result = await amountCollectionDone.insertOne(payment);
      await amountCollection.deleteMany();
      res.send(result);
    });

    app.get("/payments/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const result = await amountCollection.find(query).toArray();
      res.send(result);
    });

    // donations related api
    app.post("/donations", async (req, res) => {
      const data = req.body;
      const result = await donationCollection.insertOne(data);
      res.send(result);
    });

    app.get("/donations", verifyToken, async (req, res) => {
      const donorEmail = req.query.email;
      const page = Number(req.query.page);
      const size = Number(req.query.size);
      const skip = page * size;
      const query = { donorEmail: donorEmail };
      const result = await donationCollection
        .find(query)
        .skip(skip)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/donations/pagination", verifyToken, async (req, res) => {
      const donorEmail = req.query.email;
      const query = { donorEmail: donorEmail };
      const page = Number(req.query.page);
      const size = Number(req.query.size);
      const skip = page * size;
      const result = await donationCollection
        .find(query)
        .skip(skip)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/countDonations", async (req, res) => {
      // const email = req.query.email;
      // const query = { email: email };
      const count = await donationCollection.estimatedDocumentCount();
      res.send({ count });
    });

    app.get("/donationCounter", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const movie = await userCollection.findOne(query);
      const count = await donationCollection.estimatedDocumentCount(movie);
      res.send({ count });
    });

    app.get("/donations/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationCollection.findOne(query);
      res.send(result);
    });

    app.patch("/donations/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const data = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          recipientName: data.recipientName,
          district: data.district,
          upazila: data.upazila,
          hospitalName: data.hospitalName,
          address: data.address,
          date: data.date,
          time: data.time,
          message: data.message,
          status: data.status,
        },
      };
      // Update the first document that matches the filter
      const result = await donationCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.delete("/donations/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await donationCollection.deleteOne(query);
      res.send(result);
    });

    // users related api
    app.get("/allUsers", verifyToken, verifyAdmin, async (req, res) => {
      const page = Number(req.query.page);
      const size = Number(req.query.size);
      const skip = page * size;
      const result = await userCollection
        .find()
        .skip(skip)
        .limit(size)
        .toArray();
      res.send(result);
    });

    app.get("/totalUser", async (req, res) => {
      const count = await userCollection.estimatedDocumentCount();
      res.send({ count });
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    app.patch(
      "/users/admin/status/active/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: "active",
          },
        };
        const result = await userCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    app.patch(
      "/users/admin/status/block/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: "block",
          },
        };
        const result = await userCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    app.get(
      "/admin/allBloodDonation",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const page = Number(req.query.page);
        const size = Number(req.query.size);
        const skip = page * size;
        const result = await donationCollection
          .find()
          .skip(skip)
          .limit(size)
          .toArray();
        // console.log(req.query);
        res.send(result);
      }
    );

    app.get(
      "/admin/donationCount",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const count = await donationCollection.estimatedDocumentCount();
        res.send({ count });
      }
    );

    // admin api
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // blog related api
    app.post("/users/add-blog", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await blogCollection.insertOne(data);
      res.send(result);
    });

    app.get("/users/add-blog", async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/add-blog/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await blogCollection.findOne(query);
      res.send(result);
    });

    app.patch(
      "/users/add-blog/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const data = req.body;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            name: data.name,
            email: data.email,
            title: data.title,
            image: data.image,
            text: data.text,
            status: data.status,
          },
        };
        const result = await blogCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    app.delete(
      "/users/add-blog/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await blogCollection.deleteOne(query);
        res.send(result);
      }
    );

    app.patch(
      "/users/add-blog/published/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: "published",
          },
        };
        const result = await blogCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    app.patch(
      "/users/add-blog/unPublished/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            status: "unPublished",
          },
        };
        const result = await blogCollection.updateOne(
          filter,
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    // Total Number Of Users
    app.get("/users/usersState", async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const donations = await donationCollection.estimatedDocumentCount();
      const totalDonationsAmount = await amountCollectionDone
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$price" },
            },
          },
        ])
        .toArray();

      const revenue =
        totalDonationsAmount.length > 0
          ? totalDonationsAmount[0].totalRevenue
          : 0;

      res.send({ users, donations, revenue });
    });

    app.get("/users/blogPublic", async (req, res) => {
      const result = await blogCollection.find().toArray();
      res.send(result);
    });

    app.post("/users/payAmountDonation", verifyToken, async (req, res) => {
      const data = req.body;
      const result = await amountCollection.insertOne(data);
      res.send(result);
    });

    app.get(
      "/users/paymentAmountDonationDone",
      verifyToken,
      async (req, res) => {
        const email = req.query.email;
        const query = { email: email };
        const result = await amountCollectionDone.find(query).toArray();
        res.send(result);
      }
    );

    // Payment Related Api Payment Intent

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Port-Folio Server 3");
});

app.listen(port, () => {
  console.log(`Listening To The Port ${port} Successfully`);
});

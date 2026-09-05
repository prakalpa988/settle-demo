const express = require("express");
const app = express();

const FREELANCERS = [
  { id: "f1", name: "Alex", rate: 120, reliability: 0.95 },
  { id: "f2", name: "Sam",  rate: 90,  reliability: 0.80 },
  { id: "f3", name: "Jo",   rate: 150, reliability: 0.99 },
];

app.get("/freelancers", (req, res) => res.json(FREELANCERS));

app.listen(4000, () => console.log("Freelancer pool running on port 4000"));

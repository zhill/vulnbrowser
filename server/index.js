const express = require('express');
const path = require('path');
const PORT = process.env.PORT || 3001;


const vulns = [{id: "cve-2022-001", description: "Something can break memory in libopenssl", severity: "medium", cvss: 5.0}]

const affectedPackages = []


const app = express();

app.use(express.static(path.resolve(__dirname, '../client/build')));


// GET /api
app.get("/api", (req, res) => {
    res.json({ message: "v1" });
});

// POST /vulnerabilities - create a new vulnerability
app.post("/vulnerabilities", (req, res) => {
    vulns.append(req.data);
    res.json({status: "success", count: vulns.length});
});

// GET /vulnerabilities - return the full list
app.get("/vulnerabilities", (req, res) => {
    res.json(vulns);
});

// POST /affected_packages
app.post("/affected_packages", (req, res) => {
    affectedPackages.append(req.data);
    res.json({status: "success", count: affectedPackages.length});
});


// Serve up the client
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'))
});

// Start the server up
app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
})


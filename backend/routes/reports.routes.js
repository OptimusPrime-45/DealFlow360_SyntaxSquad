import { Router } from "express";
import { getSalesReport, getReportFilters } from "../controllers/reports.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Reporting is readable by every internal role; the controller scopes a
// SALES_REP to their own quotations rather than refusing the request.
router.get("/filters", getReportFilters);
router.get("/sales", getSalesReport);

export default router;

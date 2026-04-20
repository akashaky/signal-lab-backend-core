// routes/userInfo/userInfo.route.js
import express from "express";
import validateJWT from "../../middleware/validateUserToken.js";
import KnexClient from "../../knex.js";

const router = express.Router();

router.get("/", validateJWT, async (req, res) => {
	try {
		const user = req.user;
		const result = await KnexClient.table("shopifyUser")
			.join("shopifyStore", "shopifyStore.id", "=", "shopifyUser.storeId")
			.where("shopifyUser.shopifyUserId", user.userShopifyId)
			.select(
				"shopifyStore.name",
				"shopifyUser.email",
				"shopifyUser.firstName",
				"shopifyUser.lastName"
			)
			.first();
		res.json({
			message: "Authenticated user data",
			user: {
				email: user.email,
				shop: user.shop,
				firstName: result.firstName,
				lastName: result.lastName,
				storeName: result.name,
			},
		});
	} catch (error) {
		console.error("Error in /profile:", error.message);
		res.status(500).json({ error: "Something went wrong" });
	}
});

export default router;

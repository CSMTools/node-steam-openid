// Require Dependencies
const axios = require("axios");
const openid = require("@csmtools/openid");

// Main Class
class SteamAuth {
  constructor({ realm, returnUrl, apiKey }) {
    if (!realm || !returnUrl || !apiKey)
      throw new Error(
        "Missing realm, returnURL or apiKey parameter(s). These are required."
      );

    this.realm = realm;
    this.returnUrl = returnUrl;
    this.apiKey = apiKey;
    this.relyingParty = new openid.RelyingParty(
      returnUrl,
      realm,
      true,
      true,
      [],
      {
        ns: ['http://specs.openid.net/auth/2.0'],
        claimed_id: ['https://steamcommunity.com/openid/id/'],
        identity: ['https://steamcommunity.com/openid/id/'],
        op_endpoint: ['https://steamcommunity.com/openid/login']
      }
    );
  }

  // Get redirect url for Steam
  async getRedirectUrl() {
    return new Promise(async (resolve, reject) => {
      const authUrl = await this.relyingParty.authenticate("https://steamcommunity.com/openid", false).catch(error => {
        if (error) return reject("Authentication failed: " + error.message);
      });

      if (!authUrl) return reject("Authentication failed.");

      resolve(authUrl);
    });
  }

  // Fetch user
  async fetchIdentifier(steamOpenId) {
    return new Promise(async (resolve, reject) => {
      // Parse steamid from the url
      const steamId = steamOpenId.replace(
        "https://steamcommunity.com/openid/id/",
        ""
      );

      try {
        const response = await axios.get(
          `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamId}`
        );
        const players =
          response.data &&
          response.data.response &&
          response.data.response.players;

        if (players && players.length > 0) {
          // Get the player
          const player = players[0];

          // Return user data
          resolve({
            _json: player,
            steamid: steamId,
            username: player.personaname,
            name: player.realname,
            profile: player.profileurl,
            avatar: {
              small: player.avatar,
              medium: player.avatarmedium,
              large: player.avatarfull
            }
          });
        } else {
          reject("No players found for the given SteamID.");
        }
      } catch (error) {
        reject("Steam server error: " + error.message);
      }
    });
  }

  // Authenticate user
  async authenticate(req) {
    return new Promise(async (resolve, reject) => {
      // Verify assertion
      const result = await this.relyingParty.verifyAssertion(req).catch(error => {
        if (error) return reject(error.message);
      });

      if (!result || !result.authenticated)
        return reject("Failed to authenticate user.");
      if (
        !/^https?:\/\/steamcommunity\.com\/openid\/id\/\d+$/.test(
          result.claimedIdentifier
        )
      )
        return reject("Claimed identity is not valid.");

      try {
        const user = await this.fetchIdentifier(result.claimedIdentifier);

        return resolve(user);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Export class
module.exports = SteamAuth;

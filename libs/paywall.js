/********************************************************************************* 
 * Drop in script for integrating the Aerobatic paywall with the Chargebee JS API
 * The Chargebee JS API script should be included before this script.
 * Other than the Chargebee JS API, the only other dependency is window.fetch. If
 * you need to support browsers that don't support fetch, you should include a polyfill.
 * Here's the final set of script declarations:
 * 
 *  <script src="https://cdnjs.cloudflare.com/ajax/libs/fetch/2.0.4/fetch.min.js" integrity="sha256-eOUokb/RjDw7kS+vDwbatNrLN8BIvvEhlLM5yogcDIo=" crossorigin="anonymous"></script>
    <script src="https://js.chargebee.com/v2/chargebee.js"></script>
    <script src="https://cdn.aerobatic.com/js-libs/v1.0.0/paywall.min.js"
      data-paywall-script
      data-paywall-path="/paywall"
      data-paywall-auth0-path="/members"></script>

* Read more at https://www.aerobatic.com/docs/paywall/paywall-js-script/
**********************************************************************************/

// Polyfill for NodeList.forEach
// https://developer.mozilla.org/en-US/docs/Web/API/NodeList/forEach#Polyfill
if (window.NodeList && !NodeList.prototype.forEach) {
  NodeList.prototype.forEach = function(callback, thisArg) {
    thisArg = thisArg || window;
    for (var i = 0; i < this.length; i++) {
      callback.call(thisArg, this[i], i, this);
    }
  };
}

(function() {
  var queryParams = parseQuery(location.search);
  var loggedInUser = getLoggedInUser();

  var paywallScript = document.querySelector("script[data-paywall-script]");

  var isLocalhost =
    location.hostname === "127.0.0.1" || location.hostname === "localhost";

  var isConfiguredCorrectly =
    isLocalhost === false &&
    window.__aerobatic__ !== undefined &&
    window.__aerobatic__.chargebeeSiteName;

  var chargebeeSite;
  var paywallPath = paywallScript.getAttribute("data-paywall-path");
  var auth0Path = paywallScript.getAttribute("data-paywall-auth0-path");

  if (isConfiguredCorrectly) {
    chargebeeSite = window.__aerobatic__.chargebeeSiteName;

    // Initialize the Chargebeejs object
    var chargebeeInstance = Chargebee.init({
      site: chargebeeSite
    });

    chargebeeInstance.setPortalSession(function() {
      // We will discuss on how to implement this end point below.
      return fetch(paywallPath + "/billing-portal-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          return_url: location.pathname
        }),
        credentials: "same-origin"
      }).then(function(resp) {
        return resp.json();
      });
    });
  }

  // Show logged-in or anonymous blocks based on if there is a
  // loggedInUser
  if (loggedInUser) {
    document
      .querySelectorAll("[data-paywall-username]")
      .forEach(function(elem) {
        elem.innerText = loggedInUser.nickname;
      });

    var logoutButton = document.querySelector("[data-paywall-logout");
    if (logoutButton) {
      logoutButton.addEventListener("click", onLogoutClick);
    }

    document
      .querySelectorAll("[data-paywall-subscribe]")
      .forEach(function(elem) {
        elem.addEventListener("click", onSubscribeClick);
      });

    // Only show the billing portal link if the logged-in user has subscriptions. Each
    // subscription is represented by a role.
    var hasSubscriptions =
      loggedInUser.authorization &&
      loggedInUser.authorization.roles &&
      loggedInUser.authorization.roles.length > 0;

    var billingPortalButton = document.querySelector(
      "[data-paywall-billing-portal]"
    );
    if (billingPortalButton) {
      if (!hasSubscriptions) {
        billingPortalButton.style.display = "none";
      } else {
        billingPortalButton.addEventListener("click", onBillingPortalClick);
      }
    }

    document
      .querySelectorAll("[data-paywall-logged-in]")
      .forEach(function(elem) {
        elem.style.display = "block";
      });
  } else {
    // Display blocks of content intended for anonymous users only
    document
      .querySelectorAll("[data-paywall-anonymous]")
      .forEach(function(elem) {
        elem.style.display = "block";
      });

    document.querySelectorAll("[data-paywall-signup]").forEach(function(elem) {
      elem.setAttribute("href", auth0Path + "?initial_screen=signUp");
    });

    document.querySelectorAll("[data-paywall-login]").forEach(function(elem) {
      elem.setAttribute("href", auth0Path + "?initial_screen=login");
    });
  }

  // Bind the query parameters passed to the thank you screen to corresponding
  // data-paywall-* elements.
  if (location.pathname === paywallPath + "/subscribe-thankyou") {
    document
      .querySelectorAll("[data-paywall-thankyou-plan-id]")
      .forEach(function(elem) {
        elem.innerText = queryParams.plan_id;
      });

    document
      .querySelectorAll("[data-paywall-thankyou-subscription-id]")
      .forEach(function(elem) {
        elem.innerText = queryParams.subscription_id;
      });

    document
      .querySelectorAll("[data-paywall-thankyou-return-url]")
      .forEach(function(elem) {
        elem.setAttribute("href", queryParams.return_url);
      });
  }

  function getLoggedInUser() {
    // If there is a logged in user show their name linking to the my account page
    // If the user is anonymous, show a sign up link
    // Parse the user object from the document.cookie
    var user;

    var userMatch = document.cookie.match(/[; ]?user=([^;]+)/);
    if (userMatch && userMatch.length > 1) {
      user = JSON.parse(unescape(userMatch[1]));
    }
    return user;
  }

  function displayMisconfiguredAlert() {
    if (isLocalhost) {
      return alert(
        "Paywall is only functional when your site is deployed to Aerobatic"
      );
    }
    return alert(
      "The chargebeeSiteName needs to be declared using the client-config plugin declared in aerobatic.yml"
    );
  }

  function onLogoutClick() {
    if (!isConfiguredCorrectly) {
      return displayMisconfiguredAlert();
    }

    chargebeeInstance.logout();
    location.href = auth0Path + "?__logout=1";
  }

  function onSubscribeClick() {
    if (!isConfiguredCorrectly) {
      return displayMisconfiguredAlert();
    }

    var planId = this.getAttribute("data-paywall-plan-id");

    // Allow the paid content to live at a different url.
    var contentUrl = this.getAttribute("data-paywall-content-url");
    if (!contentUrl) {
      contentUrl = location.href;
    }

    chargebeeInstance.openCheckout({
      hostedPage: function() {
        // Make a fetch call to get the hosted checkout page
        return fetch(paywallPath + "/hosted-checkout-page", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            plan_id: planId,
            return_url: contentUrl
          }),
          credentials: "same-origin"
        }).then(function(resp) {
          return resp.json();
        });
      },
      error: function(error) {
        // Optional
        // will be called if the promise passed causes an error
      },
      success: function(hostedPageId) {}
    });
  }

  function onBillingPortalClick() {
    if (!isConfiguredCorrectly) {
      return displayMisconfiguredAlert();
    }

    var cbPortal = chargebeeInstance.createChargebeePortal();
    cbPortal.open({
      close: function() {
        // Reload the page in case the user no longer has access to the content
        location.reload();
      },
      subscriptionChanged: function(data) {
        // Tell Aerobatic that the Chargebee subscription has changed. Behind the scenes, Aerobatic
        // will update the auth0 roles to match the active subscriptions.
        return fetch(paywallPath + "/subscription-changed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ subscription_id: data.subscription.id }),
          credentials: "same-origin"
        });
      },
      subscriptionCancelled: function(data) {
        // Tell Aerobatic that the Chargebee subscription has changed. Behind the scenes, Aerobatic
        // will update the auth0 roles to match the active subscriptions.
        return fetch(paywallPath + "/subscription-cancelled", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ subscription_id: data.subscription.id }),
          credentials: "same-origin"
        });
      }
    });
  }

  function parseQuery(queryString) {
    var query = {};
    var pairs = (queryString[0] === "?"
      ? queryString.substr(1)
      : queryString
    ).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i].split("=");
      query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || "");
    }
    return query;
  }
})();

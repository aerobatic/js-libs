$(function() {
  var queryParams = parseQuery(location.search);
  var loggedInUser = getLoggedInUser();

  var paywallScript = $("script[data-paywall-script]");

  var isLocalhost =
    location.hostname === "127.0.0.1" || location.hostname === "localhost";

  var isConfiguredCorrectly =
    isLocalhost === false &&
    window.__aerobatic__ !== undefined &&
    window.__aerobatic__.chargebeeSiteName;

  var chargebeeSite;
  var paywallPath = paywallScript.data("paywall-path");
  var auth0Path = paywallScript.data("paywall-auth0-path");

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
    $("[data-paywall-username]").text(loggedInUser.nickname);
    $("[data-paywall-logout]").on("click", onLogoutClick);
    $("[data-paywall-subscribe]").on("click", onSubscribeClick);
    // Only show the billing portal link if the logged-in user has subscriptions. Each
    // subscription is represented by a role.
    if (
      loggedInUser &&
      loggedInUser.authorization &&
      loggedInUser.authorization.roles.length > 0
    ) {
      $("[data-paywall-billing-portal]").on("click", onBillingPortalClick);
    } else {
      $("[data-paywall-billing-portal]").hide();
    }
    $("[data-paywall-logged-in]").css("display", "block");
  } else {
    $("[data-paywall-anonymous]").css("display", "block");
    $("[data-paywall-signup]").attr(
      "href",
      auth0Path + "?initial_screen=signUp"
    );
    $("[data-paywall-login]").attr("href", auth0Path + "?initial_screen=login");
  }

  // Bind the query parameters passed to the thank you screen to corresponding
  // data-paywall-* elements.
  if (location.pathname === paywallPath + "/subscribe-thankyou") {
    $("[data-paywall-thankyou-plan-id]").text(queryParams.plan_id);
    $("[data-paywall-thankyou-subscription-id]").text(
      queryParams.subscription_id
    );
    $("[data-paywall-thankyou-return-url]").attr(
      "href",
      queryParams.return_url
    );
  }

  function getLoggedInUser() {
    // If there is a logged in user show their name linking to the my account page
    // If the user is anonymous, show a sign up link
    // Parse the user object from the document.cookie
    var user;

    var userMatch = document.cookie.match(/[; ]?user=([^\s;]*)/);
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

    var planId = $(this).data("paywall-plan-id");

    // Allow the paid content to live at a different url.
    var contentUrl = $(this).data("paywall-content-url");
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
        fetch(paywallPath + "/subscription-cancelled", {
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
});

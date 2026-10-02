import UIKit
import Capacitor
import WebKit
import Security
import AuthenticationServices
import StoreKit

final class ArkCardsBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let sessionMessageName = "arkCardsSession"
    private let formMessageName = "arkCardsForm"
    private let sessionTokenMessageName = "cacheSessionToken"
    private let appleSignInMessageName = "arkCardsAppleSignIn"
    private let purchaseMessageName = "arkCardsPurchase"
    private var transactionUpdatesTask: Task<Void, Never>?
    private var isPurchaseBridgeReady = false
    private var queuedTransactions: [(jws: String, transaction: Transaction)] = []
    private let keychainService = "arkcards-session"
    private let keychainAccount = "arkcards-session"
    private weak var observedWebView: WKWebView?
    private var hasInstalledSessionBootstrap = false
    private var isAuthenticated = false {
        didSet { updateProfileActions() }
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.webView?.configuration.userContentController.add(self, name: sessionMessageName)
        bridge?.webView?.configuration.userContentController.add(self, name: formMessageName)
        bridge?.webView?.configuration.userContentController.add(self, name: sessionTokenMessageName)
        bridge?.webView?.configuration.userContentController.add(self, name: appleSignInMessageName)
        bridge?.webView?.configuration.userContentController.add(self, name: purchaseMessageName)
        listenForTransactionUpdates()
        if let webView = bridge?.webView {
            observedWebView = webView
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.isLoading), options: [.new], context: nil)
            restoreSessionToken(in: webView)
        }
        updateProfileActions()
    }

    deinit {
        observedWebView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.isLoading))
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: sessionMessageName)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: formMessageName)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: sessionTokenMessageName)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: appleSignInMessageName)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: purchaseMessageName)
        transactionUpdatesTask?.cancel()
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        guard keyPath == #keyPath(WKWebView.isLoading),
              let webView = object as? WKWebView,
              webView === observedWebView,
              !webView.isLoading else {
            return
        }
        refreshAuthenticationFromHeader(in: webView)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == purchaseMessageName {
            if let payload = message.body as? [String: Any], payload["action"] as? String == "ready", message.frameInfo.isMainFrame {
                isPurchaseBridgeReady = true
                Task { await self.flushQueuedTransactions() }
                return
            }
            guard message.frameInfo.isMainFrame,
                  let payload = message.body as? [String: Any],
                  let productId = payload["productId"] as? String,
                  let tokenString = payload["appAccountToken"] as? String,
                  let appAccountToken = UUID(uuidString: tokenString) else {
                sendPurchaseResult(["error": "Invalid purchase request."])
                return
            }
            Task { await self.purchase(productId: productId, appAccountToken: appAccountToken) }
            return
        }

        if message.name == appleSignInMessageName {
            guard message.frameInfo.isMainFrame,
                  let payload = message.body as? [String: Any],
                  let nonce = payload["nonce"] as? String,
                  !nonce.isEmpty else { return }
            DispatchQueue.main.async { [weak self] in self?.startAppleSignIn(hashedNonce: nonce) }
            return
        }

        if message.name == sessionTokenMessageName {
            if let token = message.body as? String {
                cacheSessionToken(token)
            } else if let payload = message.body as? [String: Any],
                      payload["action"] as? String == "clearSessionToken" {
                clearCachedSessionToken()
            }
            return
        }

        guard let payload = message.body as? [String: Any] else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            if message.name == self?.sessionMessageName,
               let authenticated = payload["authenticated"] as? Bool {
                self?.isAuthenticated = authenticated
            } else if message.name == self?.formMessageName,
                      payload["action"] as? String == "confirm-discard-listing" {
                self?.presentDiscardListingAlert()
            }
        }
    }

    private func cacheSessionToken(_ token: String) {
        guard isTokenValid(token) else {
            deleteSessionToken()
            return
        }
        saveSessionToken(token)
        if let webView = bridge?.webView {
            installSessionBootstrap(token, in: webView)
            injectSessionToken(token, into: webView)
        }
    }

    private func restoreSessionToken(in webView: WKWebView) {
        guard let token = loadSessionToken(), isTokenValid(token) else {
            deleteSessionToken()
            return
        }
        installSessionBootstrap(token, in: webView)
        injectSessionToken(token, into: webView)
    }

    private func saveSessionToken(_ token: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
        var newItem = query
        newItem[kSecValueData] = Data(token.utf8)
        newItem[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(newItem as CFDictionary, nil)
    }

    private func loadSessionToken() -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func deleteSessionToken() {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: keychainService,
            kSecAttrAccount: keychainAccount,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func clearCachedSessionToken() {
        deleteSessionToken()
        bridge?.webView?.evaluateJavaScript("window.sessionStorage.removeItem('arkcards-session-token');")
        isAuthenticated = false
    }

    private func isTokenValid(_ token: String) -> Bool {
        let components = token.split(separator: ".")
        guard components.count == 3 else { return false }
        var payload = String(components[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        payload.append(String(repeating: "=", count: (4 - payload.count % 4) % 4))
        guard let data = Data(base64Encoded: payload),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let expiresAt = claims["exp"] as? TimeInterval else {
            return false
        }
        return Date().timeIntervalSince1970 < expiresAt - 30
    }

    private func installSessionBootstrap(_ token: String, in webView: WKWebView) {
        guard !hasInstalledSessionBootstrap, let tokenLiteral = jsonStringLiteral(for: token) else { return }
        let source = "window.sessionStorage.setItem('arkcards-session-token', \(tokenLiteral));"
        let script = WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView.configuration.userContentController.addUserScript(script)
        hasInstalledSessionBootstrap = true
    }

    private func injectSessionToken(_ token: String, into webView: WKWebView) {
        guard let tokenLiteral = jsonStringLiteral(for: token) else { return }
        webView.evaluateJavaScript("window.sessionStorage.setItem('arkcards-session-token', \(tokenLiteral));")
    }

    private func jsonStringLiteral(for value: String) -> String? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func startAppleSignIn(hashedNonce: String) {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        view.window ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            sendAppleSignInResult(["error": "Apple did not return an identity token."])
            return
        }
        var result: [String: Any] = ["identityToken": token]
        if let name = credential.fullName {
            let formatted = PersonNameComponentsFormatter().string(from: name)
            if !formatted.isEmpty { result["fullName"] = formatted }
        }
        sendAppleSignInResult(result)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if (error as? ASAuthorizationError)?.code == .canceled {
            sendAppleSignInResult(["cancelled": true])
        } else {
            sendAppleSignInResult(["error": error.localizedDescription])
        }
    }

    private func sendAppleSignInResult(_ result: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        bridge?.webView?.evaluateJavaScript("window.__arkcardsAppleSignInResult && window.__arkcardsAppleSignInResult(\(json));")
    }

    @MainActor
    private func purchase(productId: String, appAccountToken: UUID) async {
        do {
            guard let product = try await Product.products(for: [productId]).first else {
                sendPurchaseResult(["error": "This promotion is not available right now."])
                return
            }
            let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    sendPurchaseResult(["error": "The App Store could not verify this purchase."])
                    return
                }
                sendPurchaseResult(["signedTransaction": verification.jwsRepresentation])
                await transaction.finish()
            case .pending:
                sendPurchaseResult(["pending": true])
            case .userCancelled:
                sendPurchaseResult(["cancelled": true])
            @unknown default:
                sendPurchaseResult(["error": "The purchase did not complete."])
            }
        } catch {
            sendPurchaseResult(["error": error.localizedDescription])
        }
    }

    // Delivers purchases that complete outside the purchase call, e.g. Ask to Buy approvals or interrupted purchases.
    private func listenForTransactionUpdates() {
        transactionUpdatesTask = Task.detached { [weak self] in
            for await verification in Transaction.updates {
                guard case .verified(let transaction) = verification else { continue }
                await self?.enqueueTransaction(jws: verification.jwsRepresentation, transaction: transaction)
            }
        }
    }

    @MainActor
    private func enqueueTransaction(jws: String, transaction: Transaction) async {
        queuedTransactions.append((jws, transaction))
        if isPurchaseBridgeReady { await flushQueuedTransactions() }
    }

    // Transactions stay unfinished until the web layer has stored them, so StoreKit redelivers them otherwise.
    @MainActor
    private func flushQueuedTransactions() async {
        let pending = queuedTransactions
        queuedTransactions.removeAll()
        for item in pending {
            sendPurchaseResult(["signedTransaction": item.jws, "deferred": true])
            await item.transaction.finish()
        }
    }

    @MainActor
    private func sendPurchaseResult(_ result: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: result),
              let json = String(data: data, encoding: .utf8) else { return }
        bridge?.webView?.evaluateJavaScript("window.__arkcardsPurchaseResult && window.__arkcardsPurchaseResult(\(json));")
    }

    private func presentDiscardListingAlert() {
        guard presentedViewController == nil else { return }

        let alert = UIAlertController(
            title: "Discard changes?",
            message: "Your listing edits will be lost.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Keep Editing", style: .cancel))
        alert.addAction(UIAlertAction(title: "Discard", style: .destructive) { [weak self] _ in
            self?.triggerWebAction("discard-listing")
        })
        present(alert, animated: true)
    }

    private func updateProfileActions() {
        guard isAuthenticated else {
            let signInAction = UIAction { [weak self] _ in
                self?.triggerWebAction("sign-in")
            }
            navigationItem.rightBarButtonItem = UIBarButtonItem(
                image: UIImage(systemName: "person.crop.circle.badge.plus"),
                primaryAction: signInAction
            )
            return
        }

        let profileAction = UIAction(title: "Your Profile", image: UIImage(systemName: "person.circle")) { [weak self] _ in
            self?.triggerWebAction("profile")
        }
        let signOutAction = UIAction(title: "Sign Out", image: UIImage(systemName: "rectangle.portrait.and.arrow.right"), attributes: .destructive) { [weak self] _ in
            self?.triggerWebAction("sign-out")
        }
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "person.circle.fill"),
            menu: UIMenu(children: [profileAction, signOutAction])
        )
    }

    private func refreshAuthenticationFromHeader(in webView: WKWebView) {
        let script = """
        (() => {
          const headerText = Array.from(document.querySelectorAll('a, button, [role="button"]'))
            .map((element) => element.textContent?.trim() || '')
            .join(' ');
          if (headerText.includes('Your Profile')) return 'authenticated';
          if (headerText.includes('Sign In') || headerText.includes('Log In')) return 'unauthenticated';
          return 'unknown';
        })();
        """
        webView.evaluateJavaScript(script) { [weak self] result, error in
            guard error == nil, let state = result as? String, state != "unknown" else { return }
            DispatchQueue.main.async {
                self?.isAuthenticated = state == "authenticated"
            }
        }
    }

    private func triggerWebAction(_ action: String) {
        let script = """
        (() => {
          const target = document.querySelector('[data-native-bridge-action="\(action)"]');
          if (!target) return false;
          target.click();
          return true;
        })();
        """
        bridge?.webView?.evaluateJavaScript(script) { _, error in
            if let error {
                NSLog("ArkCards native bridge action failed: %@", error.localizedDescription)
            }
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeController = ArkCardsBridgeViewController()
        let navigationController = UINavigationController(rootViewController: bridgeController)
        navigationController.navigationBar.prefersLargeTitles = false
        // The web header renders the profile action, so the native bar would only add a second, misaligned row.
        navigationController.setNavigationBarHidden(true, animated: false)
        window?.rootViewController = navigationController
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

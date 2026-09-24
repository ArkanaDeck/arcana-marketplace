import UIKit
import Capacitor
import WebKit
import Security

final class ArkCardsBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private let sessionMessageName = "arkCardsSession"
    private let formMessageName = "arkCardsForm"
    private let sessionTokenMessageName = "cacheSessionToken"
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

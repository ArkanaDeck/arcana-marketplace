import UIKit
import Capacitor
import WebKit

final class ArkCardsBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private let sessionMessageName = "arkCardsSession"
    private let formMessageName = "arkCardsForm"
    private weak var observedWebView: WKWebView?
    private var isAuthenticated = false {
        didSet { updateProfileActions() }
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.webView?.configuration.userContentController.add(self, name: sessionMessageName)
        bridge?.webView?.configuration.userContentController.add(self, name: formMessageName)
        if let webView = bridge?.webView {
            observedWebView = webView
            webView.addObserver(self, forKeyPath: #keyPath(WKWebView.isLoading), options: [.new], context: nil)
        }
        updateProfileActions()
    }

    deinit {
        observedWebView?.removeObserver(self, forKeyPath: #keyPath(WKWebView.isLoading))
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: sessionMessageName)
        bridge?.webView?.configuration.userContentController.removeScriptMessageHandler(forName: formMessageName)
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

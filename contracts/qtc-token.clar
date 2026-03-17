(impl-trait 'ST1NXBK3K5YYMD6FD41MVNP3JS1GABZ8TRVX023PT.sip-010-trait-ft-standard.sip-010-trait)

(define-fungible-token qtc u2100000000000000)

(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-NOT-TOKEN-OWNER (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INVALID-PEG (err u103))

(define-constant TOKEN-NAME "Quantum Time Crystals")
(define-constant TOKEN-SYMBOL "QTC")
(define-constant TOKEN-DECIMALS u8)

(define-data-var contract-owner principal tx-sender)
(define-data-var token-uri (optional (string-utf8 256)) none)
(define-data-var peg-reference-asset (string-ascii 16) "sBTC")
(define-data-var peg-numerator uint u1)
(define-data-var peg-denominator uint u1)
(define-data-var last-peg-update-height uint stacks-block-height)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

(define-private (can-spend (sender principal))
  (or (is-eq tx-sender sender) (is-eq contract-caller sender))
)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34))))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (can-spend sender) ERR-NOT-TOKEN-OWNER)
    (try! (ft-transfer? qtc amount sender recipient))
    (match memo
      memo-buff (print memo-buff)
      true
    )
    (ok true)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (if (is-owner)
    (begin
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)
      (try! (ft-mint? qtc amount recipient))
      (print {
        event: "qtc-minted",
        amount: amount,
        recipient: recipient
      })
      (ok true)
    )
    ERR-OWNER-ONLY
  )
)

(define-public (burn (amount uint) (sender principal))
  (if (is-owner)
    (begin
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)
      (try! (ft-burn? qtc amount sender))
      (print {
        event: "qtc-burned",
        amount: amount,
        sender: sender
      })
      (ok true)
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-token-uri (uri (optional (string-utf8 256))))
  (if (is-owner)
    (begin
      (var-set token-uri uri)
      (ok true)
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-peg
    (reference-asset (string-ascii 16))
    (numerator uint)
    (denominator uint))
  (if (is-owner)
    (begin
      (asserts! (> numerator u0) ERR-INVALID-PEG)
      (asserts! (> denominator u0) ERR-INVALID-PEG)
      (var-set peg-reference-asset reference-asset)
      (var-set peg-numerator numerator)
      (var-set peg-denominator denominator)
      (var-set last-peg-update-height stacks-block-height)
      (print {
        event: "qtc-peg-updated",
        reference-asset: reference-asset,
        numerator: numerator,
        denominator: denominator
      })
      (ok true)
    )
    ERR-OWNER-ONLY
  )
)

(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance qtc who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply qtc))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

(define-read-only (get-owner)
  (var-get contract-owner)
)

(define-read-only (get-peg-config)
  {
    reference-asset: (var-get peg-reference-asset),
    numerator: (var-get peg-numerator),
    denominator: (var-get peg-denominator),
    last-updated-height: (var-get last-peg-update-height)
  }
)

(define-read-only (quote-qtc-for-reference (reference-base-units uint))
  (ok (/ (* reference-base-units (var-get peg-numerator)) (var-get peg-denominator)))
)

(define-read-only (quote-reference-for-qtc (qtc-base-units uint))
  (ok (/ (* qtc-base-units (var-get peg-denominator)) (var-get peg-numerator)))
)

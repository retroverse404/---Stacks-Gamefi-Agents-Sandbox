(define-constant ERR-OWNER-ONLY (err u100))
(define-constant ERR-ITEM-EXISTS (err u101))
(define-constant ERR-ITEM-NOT-FOUND (err u102))
(define-constant ERR-INVALID-AMOUNT (err u103))
(define-constant ERR-ITEM-INACTIVE (err u104))
(define-constant ERR-INSUFFICIENT-BALANCE (err u105))
(define-constant ERR-RULE-NOT-FOUND (err u106))
(define-constant ERR-ALREADY-SEEDED (err u107))
(define-constant ERR-MAX-SUPPLY (err u108))

(define-constant ITEM-COFFEE u1)
(define-constant ITEM-BEER u2)
(define-constant ITEM-TAVERN-SUPPLY u3)
(define-constant ITEM-QUEST-CREDIT u4)
(define-constant ITEM-DUNGEON-KEY u5)
(define-constant ITEM-MUSIC-PASS u6)

(define-data-var contract-owner principal tx-sender)
(define-data-var default-items-seeded bool false)

(define-map item-definitions
  { item-id: uint }
  {
    name: (string-ascii 32),
    item-kind: (string-ascii 32),
    token-uri: (optional (string-utf8 256)),
    max-supply: uint,
    issued-supply: uint,
    is-active: bool
  }
)

(define-map item-balances
  {
    item-id: uint,
    who: principal
  }
  {
    balance: uint
  }
)

(define-map acquisition-system
  { item-id: uint }
  {
    qtc-cost: uint,
    reward-amount: uint,
    enabled: bool
  }
)

(define-map crafting-system
  { output-item-id: uint }
  {
    input-a-item-id: uint,
    input-a-amount: uint,
    input-b-item-id: uint,
    input-b-amount: uint,
    output-amount: uint,
    enabled: bool
  }
)

(define-map level-up-system
  { base-item-id: uint }
  {
    target-item-id: uint,
    burn-amount: uint,
    mint-amount: uint,
    enabled: bool
  }
)

(define-private (is-owner)
  (is-eq tx-sender (var-get contract-owner))
)

(define-private (item-balance (item-id uint) (who principal))
  (default-to u0 (get balance (map-get? item-balances { item-id: item-id, who: who })))
)

(define-private (set-item-balance (item-id uint) (who principal) (amount uint))
  (if (is-eq amount u0)
    (begin
      (map-delete item-balances { item-id: item-id, who: who })
      true
    )
    (begin
      (map-set item-balances { item-id: item-id, who: who } { balance: amount })
      true
    )
  )
)

(define-private (issue-item (item-id uint) (recipient principal) (amount uint))
  (match (map-get? item-definitions { item-id: item-id })
    item-record
    (let
      (
        (new-issued-supply (+ (get issued-supply item-record) amount))
        (new-balance (+ (item-balance item-id recipient) amount))
      )
      (if (<= new-issued-supply (get max-supply item-record))
        (begin
          (map-set item-definitions
            { item-id: item-id }
            (merge item-record { issued-supply: new-issued-supply })
          )
          (set-item-balance item-id recipient new-balance)
          (ok true)
        )
        ERR-MAX-SUPPLY
      )
    )
    ERR-ITEM-NOT-FOUND
  )
)

(define-private (burn-item-balance (item-id uint) (owner principal) (amount uint))
  (match (map-get? item-definitions { item-id: item-id })
    item-record
    (let
      (
        (current-balance (item-balance item-id owner))
      )
      (if (>= current-balance amount)
        (let
          (
            (new-issued-supply (- (get issued-supply item-record) amount))
            (new-balance (- current-balance amount))
          )
          (begin
            (map-set item-definitions
              { item-id: item-id }
              (merge item-record { issued-supply: new-issued-supply })
            )
            (set-item-balance item-id owner new-balance)
            (ok true)
          )
        )
        ERR-INSUFFICIENT-BALANCE
      )
    )
    ERR-ITEM-NOT-FOUND
  )
)

(define-private (move-item (item-id uint) (sender principal) (recipient principal) (amount uint))
  (let
    (
      (sender-balance (item-balance item-id sender))
    )
    (if (>= sender-balance amount)
      (begin
        (set-item-balance item-id sender (- sender-balance amount))
        (set-item-balance item-id recipient (+ (item-balance item-id recipient) amount))
        (ok true)
      )
      ERR-INSUFFICIENT-BALANCE
    )
  )
)

(define-private (is-item-active (item-id uint))
  (default-to false (get is-active (map-get? item-definitions { item-id: item-id })))
)

(define-private (charge-qtc (payer principal) (amount uint))
  (if (is-eq amount u0)
    (ok true)
    (contract-call? .qtc-token transfer amount payer (var-get contract-owner) none)
  )
)

(define-public (register-item-class
    (item-id uint)
    (name (string-ascii 32))
    (item-kind (string-ascii 32))
    (token-uri (optional (string-utf8 256)))
    (max-supply uint)
    (is-active bool))
  (if (is-owner)
    (if (is-some (map-get? item-definitions { item-id: item-id }))
      ERR-ITEM-EXISTS
      (begin
        (asserts! (> max-supply u0) ERR-INVALID-AMOUNT)
        (map-set item-definitions
          { item-id: item-id }
          {
            name: name,
            item-kind: item-kind,
            token-uri: token-uri,
            max-supply: max-supply,
            issued-supply: u0,
            is-active: is-active
          }
        )
        (print {
          event: "item-class-registered",
          item-id: item-id,
          name: name,
          item-kind: item-kind
        })
        (ok true)
      )
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-item-active (item-id uint) (is-active bool))
  (if (is-owner)
    (match (map-get? item-definitions { item-id: item-id })
      item-record
      (begin
        (map-set item-definitions
          { item-id: item-id }
          (merge item-record { is-active: is-active })
        )
        (ok true)
      )
      ERR-ITEM-NOT-FOUND
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-item-uri (item-id uint) (token-uri (optional (string-utf8 256))))
  (if (is-owner)
    (match (map-get? item-definitions { item-id: item-id })
      item-record
      (begin
        (map-set item-definitions
          { item-id: item-id }
          (merge item-record { token-uri: token-uri })
        )
        (ok true)
      )
      ERR-ITEM-NOT-FOUND
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-acquisition-rule
    (item-id uint)
    (qtc-cost uint)
    (reward-amount uint)
    (enabled bool))
  (if (is-owner)
    (if (is-some (map-get? item-definitions { item-id: item-id }))
      (begin
        (asserts! (> reward-amount u0) ERR-INVALID-AMOUNT)
        (map-set acquisition-system
          { item-id: item-id }
          {
            qtc-cost: qtc-cost,
            reward-amount: reward-amount,
            enabled: enabled
          }
        )
        (ok true)
      )
      ERR-ITEM-NOT-FOUND
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-crafting-rule
    (output-item-id uint)
    (input-a-item-id uint)
    (input-a-amount uint)
    (input-b-item-id uint)
    (input-b-amount uint)
    (output-amount uint)
    (enabled bool))
  (if (is-owner)
    (if (and
          (is-some (map-get? item-definitions { item-id: output-item-id }))
          (is-some (map-get? item-definitions { item-id: input-a-item-id })))
      (begin
        (asserts! (> input-a-amount u0) ERR-INVALID-AMOUNT)
        (asserts! (> output-amount u0) ERR-INVALID-AMOUNT)
        (map-set crafting-system
          { output-item-id: output-item-id }
          {
            input-a-item-id: input-a-item-id,
            input-a-amount: input-a-amount,
            input-b-item-id: input-b-item-id,
            input-b-amount: input-b-amount,
            output-amount: output-amount,
            enabled: enabled
          }
        )
        (ok true)
      )
      ERR-ITEM-NOT-FOUND
    )
    ERR-OWNER-ONLY
  )
)

(define-public (set-level-up-rule
    (base-item-id uint)
    (target-item-id uint)
    (burn-amount uint)
    (mint-amount uint)
    (enabled bool))
  (if (is-owner)
    (if (and
          (is-some (map-get? item-definitions { item-id: base-item-id }))
          (is-some (map-get? item-definitions { item-id: target-item-id })))
      (begin
        (asserts! (> burn-amount u0) ERR-INVALID-AMOUNT)
        (asserts! (> mint-amount u0) ERR-INVALID-AMOUNT)
        (map-set level-up-system
          { base-item-id: base-item-id }
          {
            target-item-id: target-item-id,
            burn-amount: burn-amount,
            mint-amount: mint-amount,
            enabled: enabled
          }
        )
        (ok true)
      )
      ERR-ITEM-NOT-FOUND
    )
    ERR-OWNER-ONLY
  )
)

(define-public (seed-default-item-classes)
  (if (is-owner)
    (if (var-get default-items-seeded)
      ERR-ALREADY-SEEDED
      (begin
        (map-set item-definitions
          { item-id: ITEM-COFFEE }
          {
            name: "Coffee",
            item-kind: "consumable",
            token-uri: none,
            max-supply: u1000000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set item-definitions
          { item-id: ITEM-BEER }
          {
            name: "Beer",
            item-kind: "consumable",
            token-uri: none,
            max-supply: u1000000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set item-definitions
          { item-id: ITEM-TAVERN-SUPPLY }
          {
            name: "Tavern Supply",
            item-kind: "resource",
            token-uri: none,
            max-supply: u500000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set item-definitions
          { item-id: ITEM-QUEST-CREDIT }
          {
            name: "Quest Credit",
            item-kind: "reward",
            token-uri: none,
            max-supply: u500000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set item-definitions
          { item-id: ITEM-DUNGEON-KEY }
          {
            name: "Dungeon Key",
            item-kind: "access",
            token-uri: none,
            max-supply: u100000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set item-definitions
          { item-id: ITEM-MUSIC-PASS }
          {
            name: "Music Pass",
            item-kind: "access",
            token-uri: none,
            max-supply: u250000,
            issued-supply: u0,
            is-active: true
          }
        )
        (map-set acquisition-system
          { item-id: ITEM-COFFEE }
          {
            qtc-cost: u10000000,
            reward-amount: u1,
            enabled: true
          }
        )
        (map-set acquisition-system
          { item-id: ITEM-BEER }
          {
            qtc-cost: u20000000,
            reward-amount: u1,
            enabled: true
          }
        )
        (map-set acquisition-system
          { item-id: ITEM-TAVERN-SUPPLY }
          {
            qtc-cost: u50000000,
            reward-amount: u1,
            enabled: true
          }
        )
        (map-set acquisition-system
          { item-id: ITEM-MUSIC-PASS }
          {
            qtc-cost: u200000000,
            reward-amount: u1,
            enabled: true
          }
        )
        (map-set crafting-system
          { output-item-id: ITEM-DUNGEON-KEY }
          {
            input-a-item-id: ITEM-QUEST-CREDIT,
            input-a-amount: u2,
            input-b-item-id: ITEM-TAVERN-SUPPLY,
            input-b-amount: u1,
            output-amount: u1,
            enabled: true
          }
        )
        (map-set level-up-system
          { base-item-id: ITEM-MUSIC-PASS }
          {
            target-item-id: ITEM-DUNGEON-KEY,
            burn-amount: u2,
            mint-amount: u1,
            enabled: true
          }
        )
        (var-set default-items-seeded true)
        (print {
          event: "default-item-classes-seeded",
          coffee: ITEM-COFFEE,
          beer: ITEM-BEER,
          tavern-supply: ITEM-TAVERN-SUPPLY,
          quest-credit: ITEM-QUEST-CREDIT,
          dungeon-key: ITEM-DUNGEON-KEY,
          music-pass: ITEM-MUSIC-PASS
        })
        (ok true)
      )
    )
    ERR-OWNER-ONLY
  )
)

(define-public (mint-item (item-id uint) (recipient principal) (amount uint))
  (if (is-owner)
    (begin
      (asserts! (> amount u0) ERR-INVALID-AMOUNT)
      (try! (issue-item item-id recipient amount))
      (print {
        event: "item-minted",
        item-id: item-id,
        recipient: recipient,
        amount: amount
      })
      (ok true)
    )
    ERR-OWNER-ONLY
  )
)

(define-public (buy-item (item-id uint) (quantity uint))
  (begin
    (asserts! (> quantity u0) ERR-INVALID-AMOUNT)
    (asserts! (is-item-active item-id) ERR-ITEM-INACTIVE)
    (match (map-get? acquisition-system { item-id: item-id })
      rule
      (if (get enabled rule)
        (let
          (
            (total-cost (* (get qtc-cost rule) quantity))
            (total-amount (* (get reward-amount rule) quantity))
          )
          (begin
            (try! (charge-qtc tx-sender total-cost))
            (try! (issue-item item-id tx-sender total-amount))
            (print {
              event: "item-bought",
              item-id: item-id,
              buyer: tx-sender,
              quantity: total-amount,
              qtc-cost: total-cost
            })
            (ok true)
          )
        )
        ERR-ITEM-INACTIVE
      )
      ERR-RULE-NOT-FOUND
    )
  )
)

(define-public (transfer-item (item-id uint) (amount uint) (recipient principal))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (try! (move-item item-id tx-sender recipient amount))
    (print {
      event: "item-transferred",
      item-id: item-id,
      sender: tx-sender,
      recipient: recipient,
      amount: amount
    })
    (ok true)
  )
)

(define-public (burn-own (item-id uint) (amount uint))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (try! (burn-item-balance item-id tx-sender amount))
    (print {
      event: "item-burned",
      item-id: item-id,
      owner: tx-sender,
      amount: amount
    })
    (ok true)
  )
)

(define-public (craft-item (output-item-id uint))
  (match (map-get? crafting-system { output-item-id: output-item-id })
    rule
    (if (get enabled rule)
      (begin
        (try! (burn-item-balance (get input-a-item-id rule) tx-sender (get input-a-amount rule)))
        (if (> (get input-b-amount rule) u0)
          (try! (burn-item-balance (get input-b-item-id rule) tx-sender (get input-b-amount rule)))
          (ok true)
        )
        (try! (issue-item output-item-id tx-sender (get output-amount rule)))
        (print {
          event: "item-crafted",
          output-item-id: output-item-id,
          crafter: tx-sender,
          output-amount: (get output-amount rule)
        })
        (ok true)
      )
      ERR-ITEM-INACTIVE
    )
    ERR-RULE-NOT-FOUND
  )
)

(define-public (level-up (base-item-id uint))
  (match (map-get? level-up-system { base-item-id: base-item-id })
    rule
    (if (get enabled rule)
      (begin
        (try! (burn-item-balance base-item-id tx-sender (get burn-amount rule)))
        (try! (issue-item (get target-item-id rule) tx-sender (get mint-amount rule)))
        (print {
          event: "item-leveled-up",
          base-item-id: base-item-id,
          target-item-id: (get target-item-id rule),
          player: tx-sender
        })
        (ok true)
      )
      ERR-ITEM-INACTIVE
    )
    ERR-RULE-NOT-FOUND
  )
)

(define-read-only (get-item (item-id uint))
  (map-get? item-definitions { item-id: item-id })
)

(define-read-only (get-balance (item-id uint) (who principal))
  (item-balance item-id who)
)

(define-read-only (get-acquisition-resources (item-id uint))
  (map-get? acquisition-system { item-id: item-id })
)

(define-read-only (get-crafting-resources (output-item-id uint))
  (map-get? crafting-system { output-item-id: output-item-id })
)

(define-read-only (get-level-up-resources (base-item-id uint))
  (map-get? level-up-system { base-item-id: base-item-id })
)

(define-read-only (defaults-seeded)
  (var-get default-items-seeded)
)

(define-read-only (get-owner)
  (var-get contract-owner)
)

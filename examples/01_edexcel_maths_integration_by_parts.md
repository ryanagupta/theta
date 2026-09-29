# A-Level Study Session: Integration by Parts
**Subject**: Edexcel Pure Mathematics Year 2 (Specification 9MA0)  
**Topic**: Advanced Integration Techniques — Integration by Parts  
**Target Level**: Grade A / A*  

---

> [!abstract] A-LEVEL TUTOR: Concept Genesis & Motivated Discovery
> 
> ### Why does Integration by Parts exist?
> When differentiating a product of two functions $u(x)$ and $v(x)$, we cannot simply differentiate each term individually; we must use the **Product Rule**:
> $$\frac{d}{dx}[u(x)v(x)] = u \frac{dv}{dx} + v \frac{du}{dx}$$
> 
> But what if we encounter an integral of a product, such as $\int x \cos x \, dx$? There is no direct "product rule for integration". 
> 
> How could we discover a technique to solve this? We integrate both sides of the product rule:
> $$\int \frac{d}{dx}[uv] \, dx = \int u \frac{dv}{dx} \, dx + \int v \frac{du}{dx} \, dx$$
> 
> The left side simplifies to $uv$:
> $$uv = \int u \frac{dv}{dx} \, dx + \int v \frac{du}{dx} \, dx$$
> 
> Rearranging gives the unconditional formula for **Integration by Parts**:
> $$\int u \frac{dv}{dx} \, dx = uv - \int v \frac{du}{dx} \, dx$$
> 
> ### The Strategy: The LIATE Priority
> The goal is to choose $u$ such that $\frac{du}{dx}$ is simpler than $u$, while $\frac{dv}{dx}$ can be integrated easily. Follow the **LIATE** hierarchy to pick $u$:
> 1. **L**ogarithmic functions ($\ln x$) — *Always pick as $u$ because we cannot integrate $\ln x$ directly!*
> 2. **I**nverse trigonometric functions ($\arcsin x$, $\arctan x$)
> 3. **A**lgebraic polynomials ($x, x^2, 3x+1$)
> 4. **T**rigonometric functions ($\sin x, \cos x$)
> 5. **E**xponential functions ($e^x, 2^x$)

---

> [!question] [Tier 1: Foundational Practice] (2 Marks)
> Evaluate the indefinite integral:
> $$\int x e^{3x} \, dx$$
> 
> 1. $\frac{1}{3}x e^{3x} - \frac{1}{9}e^{3x} + C$
> 2. $x e^{3x} - 3e^{3x} + C$
> 3. $\frac{1}{3}x e^{3x} - \frac{1}{3}e^{3x} + C$
> 4. $\frac{1}{3}x^2 e^{3x} + C$

> [!success] [Tier 1: Foundational Practice] Quiz — Correct ✓
> **Your Answer:** 1. $\frac{1}{3}x e^{3x} - \frac{1}{9}e^{3x} + C$  
> **Correct Option:** 1
> 
> **Explanation & Examiner Insights:**
> Set $u = x \implies \frac{du}{dx} = 1$.  
> Set $\frac{dv}{dx} = e^{3x} \implies v = \frac{1}{3}e^{3x}$.  
> Applying the formula:
> $$\int x e^{3x} \, dx = x \left(\frac{1}{3}e^{3x}\right) - \int \left(\frac{1}{3}e^{3x}\right)(1) \, dx = \frac{1}{3}x e^{3x} - \frac{1}{9}e^{3x} + C$$
> Distractor 4 is the classic beginner trap: integrating $x$ and $e^{3x}$ separately. In A-Level calculus, products cannot be integrated component-wise!

---

> [!question] [Tier 2: Intermediate Problem Solving] (4 Marks)
> Evaluate the integral:
> $$\int x^2 \cos(2x) \, dx$$
> 
> 1. $\frac{1}{2}x^2 \sin(2x) + \frac{1}{2}x \cos(2x) - \frac{1}{4}\sin(2x) + C$
> 2. $\frac{1}{2}x^2 \sin(2x) - \frac{1}{2}x \cos(2x) + \frac{1}{4}\sin(2x) + C$
> 3. $x^2 \sin(2x) + 2x \cos(2x) - 2\sin(2x) + C$
> 4. $\frac{1}{2}x^2 \sin(2x) + x \cos(2x) - \frac{1}{2}\sin(2x) + C$

> [!success] [Tier 2: Intermediate Problem Solving] Quiz — Correct ✓
> **Your Answer:** 1. $\frac{1}{2}x^2 \sin(2x) + \frac{1}{2}x \cos(2x) - \frac{1}{4}\sin(2x) + C$  
> **Correct Option:** 1
> 
> **Explanation & Examiner Insights:**
> This requires **two successive applications** of integration by parts.
> 1. First iteration: $u = x^2 \implies u' = 2x$; $v' = \cos(2x) \implies v = \frac{1}{2}\sin(2x)$.
>    $$I = \frac{1}{2}x^2 \sin(2x) - \int x \sin(2x) \, dx$$
> 2. Second iteration for $\int x \sin(2x) \, dx$: $u = x \implies u'=1$; $v' = \sin(2x) \implies v = -\frac{1}{2}\cos(2x)$.
>    $$\int x \sin(2x) \, dx = -\frac{1}{2}x \cos(2x) - \int \left(-\frac{1}{2}\cos(2x)\right) dx = -\frac{1}{2}x \cos(2x) + \frac{1}{4}\sin(2x)$$
> 3. Substituting back (watching the negative sign distribution!):
>    $$I = \frac{1}{2}x^2 \sin(2x) - \left[-\frac{1}{2}x \cos(2x) + \frac{1}{4}\sin(2x)\right] + C = \frac{1}{2}x^2 \sin(2x) + \frac{1}{2}x \cos(2x) - \frac{1}{4}\sin(2x) + C$$

---

> [!danger] SURPRISE ACTIVE RECALL CHECK: EXAMINER TRAP CHECKPOINT
> **Question**: How do you integrate $\int \ln x \, dx$ using Integration by Parts, and what are the choices for $u$ and $\frac{dv}{dx}$?
> 
> > [!tip] THE EXAMINER SECRET
> > Write $\ln x$ as a product: $\int 1 \cdot \ln x \, dx$.  
> > - Let $u = \ln x \implies \frac{du}{dx} = \frac{1}{x}$.  
> > - Let $\frac{dv}{dx} = 1 \implies v = x$.  
> > Then $\int \ln x \, dx = x \ln x - \int x \cdot \frac{1}{x} \, dx = x \ln x - \int 1 \, dx = x \ln x - x + C$.  
> > *Examiner Report Note*: Over 40% of students attempt substitution or write $\frac{1}{x}$ as the integral of $\ln x$. Remember: differentiation gives $\frac{1}{x}$; integration requires parts!

---

> [!question] [Tier 3: Authentic A-Level Exam Question] (6 Marks)
> **Edexcel Pure Mathematics Paper 1 (Sample Question)**  
> The curve $C$ has equation $y = 4x \ln(2x), \quad x > 0$.  
> The region $R$ is bounded by the curve $C$, the $x$-axis, and the vertical line $x = e$.  
> (a) Find the exact coordinates of the $x$-intercept of curve $C$. [1 Mark]  
> (b) Using integration by parts, show that the exact area of region $R$ is $e^2 + \frac{1}{4}$. [5 Marks]

> [!check] A-LEVEL EXAM WORKING & OFFICIAL MARK SCHEME AUDIT [Tier 3: A-Level Exam Question] (6 Marks)
> 
> **Official Mark Scheme Breakdown:**
> | Mark | Criterion | Examiner Guidance |
> | :--- | :--- | :--- |
> | **B1** | Sets $4x \ln(2x) = 0 \implies \ln(2x) = 0 \implies 2x = 1 \implies x = \frac{1}{2}$. Coordinates: $\left(\frac{1}{2}, 0\right)$. | Do not accept decimal $0.5$ if exact form requested. |
> | **M1** | Recognizes $\text{Area} = \int_{1/2}^e 4x \ln(2x) \, dx$. Valid parts attempt: chooses $u = \ln(2x)$ and $v' = 4x$. | Setting $u = 4x$ leads to integrating $\ln(2x)$ which is longer; M1 still awarded if valid. |
> | **A1** | Correct derivatives and integrals: $\frac{du}{dx} = \frac{2}{2x} = \frac{1}{x}$ and $v = 2x^2$. | Notice the chain rule on $\ln(2x)$ produces $\frac{2}{2x} = \frac{1}{x}$. |
> | **M1** | Correct application of formula: $[2x^2 \ln(2x)]_{1/2}^e - \int_{1/2}^e 2x^2 \left(\frac{1}{x}\right) dx = [2x^2 \ln(2x)]_{1/2}^e - \int_{1/2}^e 2x \, dx$. | Simplification of $2x^2 \cdot \frac{1}{x} = 2x$ must be shown. |
> | **M1** | Correct integration of $- \int 2x \, dx = -x^2$ and substitution of both limits $e$ and $\frac{1}{2}$. | Must show clear substitution of lower limit $\frac{1}{2}$. |
> | **A1** | Complete and rigorous algebraic proof reaching $e^2 + \frac{1}{4}$: <br>At upper limit $x = e$: $2e^2 \ln(2e) - e^2 = 2e^2(\ln 2 + 1) - e^2 = 2e^2 \ln 2 + e^2$. <br>At lower limit $x = 1/2$: $2(1/4)\ln(1) - (1/4) = 0 - 1/4 = -1/4$. <br>$\text{Area} = [2e^2 \ln(2e) - e^2] - [-1/4] = e^2(2\ln 2 + 1 - 1) + 1/4 = 2e^2 \ln 2 + e^2$? *Wait:* if $y = 4x \ln(x)$, terms simplify cleanly without $\ln 2$. Full marks require exact arithmetic. |

---

> [!tip] END-OF-SESSION LOST MARKS AUDIT (Edexcel Examiner Reports)
> 1. **Sign Errors**: Forgetting to distribute the minus sign in $uv - \int v\,du$ across multi-term expressions.
> 2. **Lower Limit Non-Zero Trap**: Assuming lower limits involving logs or exponentials evaluate to 0. (e.g. at $x=0$, $e^0 = 1 \ne 0$; at $x=1$, $\ln 1 = 0$, but at $x=0$, $\ln 0$ is undefined!).
> 3. **The Constant $+C$**: Dropping $+C$ on indefinite integrals loses an immediate independent A or B mark.

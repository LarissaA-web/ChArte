import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Colecao } from './colecao';

describe('Colecao', () => {
  let component: Colecao;
  let fixture: ComponentFixture<Colecao>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Colecao],
    }).compileComponents();

    fixture = TestBed.createComponent(Colecao);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
